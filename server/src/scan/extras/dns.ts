import dns from 'node:dns/promises';
import net from 'node:net';
import type { DnsInfo } from '../../../../shared/report.js';

// Second-level public suffixes common enough to matter for the "registrable domain" guess.
const MULTI_PART_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'me.uk', 'com.au', 'net.au', 'org.au', 'co.nz', 'org.nz',
  'co.za', 'com.br', 'com.mx', 'co.jp', 'co.in', 'com.sg', 'com.hk', 'com.tr', 'com.ar', 'co.kr', 'com.cn',
]);

export function registrableDomain(host: string): string {
  const parts = host.toLowerCase().replace(/\.$/, '').split('.');
  if (parts.length <= 2 || net.isIP(host)) return host;
  const lastTwo = parts.slice(-2).join('.');
  return MULTI_PART_SUFFIXES.has(lastTwo) ? parts.slice(-3).join('.') : lastTwo;
}

const EMAIL_PROVIDERS: [RegExp, string][] = [
  [/google\.com$|googlemail\.com$/, 'Google Workspace'],
  [/protection\.outlook\.com$|outlook\.com$/, 'Microsoft 365'],
  [/zoho\.(com|eu|in)$/, 'Zoho Mail'],
  [/protonmail\.ch$|proton\.me$/, 'Proton Mail'],
  [/pphosted\.com$/, 'Proofpoint (filtering)'],
  [/mimecast\.com$/, 'Mimecast (filtering)'],
  [/secureserver\.net$/, 'GoDaddy Email'],
  [/messagingengine\.com$/, 'Fastmail'],
  [/icloud\.com$/, 'iCloud Mail'],
  [/mailgun\.org$/, 'Mailgun'],
  [/amazonaws\.com$|awsapps\.com$/, 'Amazon WorkMail / SES'],
  [/yandex\.(net|ru)$/, 'Yandex Mail'],
  [/ovh\.net$/, 'OVH Mail'],
  [/hostinger\.com$/, 'Hostinger Email'],
  [/titan\.email$/, 'Titan Email'],
  [/emailsrvr\.com$/, 'Rackspace Email'],
  [/barracudanetworks\.com$/, 'Barracuda (filtering)'],
];

const DNS_PROVIDERS: [RegExp, string][] = [
  [/cloudflare\.com$/, 'Cloudflare'],
  [/awsdns/, 'Amazon Route 53'],
  [/domaincontrol\.com$/, 'GoDaddy'],
  [/registrar-servers\.com$/, 'Namecheap'],
  [/googledomains\.com$|google\.com$/, 'Google Cloud DNS'],
  [/azure-dns/, 'Azure DNS'],
  [/nsone\.net$/, 'NS1'],
  [/dnsimple\.com$/, 'DNSimple'],
  [/digitalocean\.com$/, 'DigitalOcean'],
  [/vercel-dns\.com$/, 'Vercel'],
  [/netlify/, 'Netlify'],
  [/wixdns\.net$/, 'Wix'],
  [/squarespacedns\.com$/, 'Squarespace'],
  [/shopify/, 'Shopify'],
  [/hostgator\.com$/, 'HostGator'],
  [/bluehost\.com$/, 'Bluehost'],
  [/siteground\.(net|com)$/, 'SiteGround'],
  [/wpengine\.com$/, 'WP Engine'],
  [/kinsta/, 'Kinsta'],
  [/dynect\.net$/, 'Oracle Dyn'],
  [/ultradns/, 'UltraDNS'],
  [/akam/, 'Akamai'],
  [/hetzner/, 'Hetzner'],
  [/ionos|ui-dns/, 'IONOS'],
  [/ovh\.net$/, 'OVH'],
  [/name-services\.com$/, 'Enom'],
  [/worldnic\.com$/, 'Network Solutions'],
];

const TXT_SERVICES: [RegExp, string][] = [
  [/include:_spf\.google\.com/, 'Google Workspace (SPF)'],
  [/include:spf\.protection\.outlook\.com/, 'Microsoft 365 (SPF)'],
  [/include:servers\.mcsv\.net|mailchimp/i, 'Mailchimp'],
  [/include:sendgrid\.net/, 'SendGrid'],
  [/include:mailgun\.org/, 'Mailgun'],
  [/include:amazonses\.com/, 'Amazon SES'],
  [/hubspot|include:\d+\.spf\d*\.hubspotemail\.net/i, 'HubSpot'],
  [/include:_spf\.salesforce\.com|salesforce/i, 'Salesforce'],
  [/include:mail\.zendesk\.com|zendesk/i, 'Zendesk'],
  [/include:spf\.mandrillapp\.com/, 'Mandrill'],
  [/include:_spf\.createsend\.com/, 'Campaign Monitor'],
  [/include:spf\.constantcontact\.com/, 'Constant Contact'],
  [/klaviyo/i, 'Klaviyo'],
  [/include:spf\.brevo\.com|sendinblue/i, 'Brevo'],
  [/include:.*freshdesk/i, 'Freshdesk'],
  [/include:.*shopify/i, 'Shopify Email'],
  [/include:.*zoho/i, 'Zoho'],
  [/include:.*intercom/i, 'Intercom'],
  [/include:.*postmarkapp/i, 'Postmark'],
  [/google-site-verification=/, 'Google Search Console'],
  [/facebook-domain-verification=/, 'Meta Business'],
  [/^MS=ms\d+/, 'Microsoft 365 (verified)'],
  [/apple-domain-verification=/, 'Apple'],
  [/atlassian-domain-verification=/, 'Atlassian'],
  [/docusign=/, 'DocuSign'],
  [/stripe-verification=/, 'Stripe'],
  [/ZOOM_verify_/i, 'Zoom'],
  [/adobe-idp-site-verification=/, 'Adobe'],
  [/hubspot-developer-verification|hs-site-verification/i, 'HubSpot'],
  [/pinterest-site-verification=/, 'Pinterest'],
  [/slack-domain-verification=/, 'Slack'],
  [/canva-site-verification=/, 'Canva'],
  [/miro-verification=/, 'Miro'],
  [/notion-domain-verification=/i, 'Notion'],
  [/openai-domain-verification=/, 'OpenAI'],
  [/v=DMARC1/, 'DMARC'],
];

const settle = async <T>(p: Promise<T>, fallback: T): Promise<T> => {
  try {
    return await p;
  } catch {
    return fallback;
  }
};

export async function probeDns(host: string): Promise<{ info: DnsInfo; records: Record<string, string[]> }> {
  const domain = registrableDomain(host);
  const [a, aaaa, mx, ns, txt, dmarc, cname, soa] = await Promise.all([
    settle(dns.resolve4(host), [] as string[]),
    settle(dns.resolve6(host), [] as string[]),
    settle(dns.resolveMx(domain), [] as { exchange: string; priority: number }[]),
    settle(dns.resolveNs(domain), [] as string[]),
    settle(dns.resolveTxt(domain), [] as string[][]),
    settle(dns.resolveTxt(`_dmarc.${domain}`), [] as string[][]),
    settle(dns.resolveCname(host), [] as string[]),
    settle(dns.resolveSoa(domain), null),
  ]);

  const ips = [...a, ...aaaa];
  const reverse = (await Promise.all(a.slice(0, 2).map((ip) => settle(dns.reverse(ip), [] as string[])))).flat();
  const mxHosts = mx.sort((x, y) => x.priority - y.priority).map((m) => m.exchange.toLowerCase());
  const txtValues = [...txt, ...dmarc].map((parts) => parts.join(''));

  const emailProvider = mxHosts.map((h) => EMAIL_PROVIDERS.find(([re]) => re.test(h))?.[1]).find(Boolean);
  const dnsProvider = ns.map((h) => DNS_PROVIDERS.find(([re]) => re.test(h.toLowerCase()))?.[1]).find(Boolean);
  const services = new Set<string>();
  for (const v of txtValues) for (const [re, name] of TXT_SERVICES) if (re.test(v)) services.add(name);

  return {
    info: {
      domain,
      ips,
      reverseDns: reverse,
      nameservers: ns.map((n) => n.toLowerCase()),
      dnsProvider,
      mx: mxHosts,
      emailProvider: emailProvider ?? (mxHosts.length ? undefined : 'No email (no MX records)'),
      services: [...services],
    },
    records: {
      TXT: txtValues,
      MX: mxHosts,
      NS: ns,
      CNAME: cname,
      SOA: soa ? [`${soa.nsname} ${soa.hostmaster}`] : [],
    },
  };
}
