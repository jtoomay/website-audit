import type { ShopifyInfo } from '../../../../shared/report.js';

/** Shopify details from the `window.Shopify` global (browser mode) or the raw HTML (fetch mode). */
export function extractShopify(global: Record<string, any> | undefined, html: string): ShopifyInfo {
  const info: ShopifyInfo = {};
  if (global) {
    info.shop = global.shop;
    info.themeName = global.theme?.schema_name ? `${global.theme.schema_name}${global.theme.name && global.theme.name !== global.theme.schema_name ? ` (“${global.theme.name}”)` : ''}` : global.theme?.name;
    info.themeId = global.theme?.id;
    info.themeStoreId = global.theme?.theme_store_id ?? undefined;
    info.currency = global.currency;
    info.country = global.country;
  }
  if (!info.themeName) {
    const m = html.match(/Shopify\.theme\s*=\s*(\{[^;]+\})/);
    if (m) {
      try {
        const t = JSON.parse(m[1]);
        info.themeName = t.schema_name ?? t.name;
        info.themeId = t.id;
        info.themeStoreId = t.theme_store_id ?? undefined;
      } catch {
        /* not strict JSON */
      }
    }
  }
  if (!info.shop) info.shop = html.match(/Shopify\.shop\s*=\s*"([^"]+)"/)?.[1];
  return info;
}
