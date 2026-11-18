import tls from 'node:tls';
import type { TlsInfo } from '../../../../shared/report.js';

export function probeTls(host: string, timeoutMs = 6000): Promise<TlsInfo | undefined> {
  return new Promise((resolve) => {
    const socket = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: false, timeout: timeoutMs });
    const done = (v: TlsInfo | undefined) => {
      socket.destroy();
      resolve(v);
    };
    socket.once('secureConnect', () => {
      const cert = socket.getPeerCertificate();
      if (!cert || !cert.valid_to) return done(undefined);
      const issuer = [cert.issuer?.O, cert.issuer?.CN].flat().filter(Boolean)[0] as string | undefined;
      const validTo = new Date(cert.valid_to);
      done({
        issuer,
        subject: ([cert.subject?.CN].flat()[0] as string | undefined) ?? undefined,
        validFrom: new Date(cert.valid_from).toISOString(),
        validTo: validTo.toISOString(),
        daysRemaining: Math.round((validTo.getTime() - Date.now()) / 86_400_000),
        protocol: socket.getProtocol() ?? undefined,
        altNames: cert.subjectaltname ? cert.subjectaltname.split(',').length : 0,
      });
    });
    socket.once('timeout', () => done(undefined));
    socket.once('error', () => done(undefined));
  });
}
