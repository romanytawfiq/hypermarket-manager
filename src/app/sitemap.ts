import type { MetadataRoute } from "next";

/**
 * Public sitemap (Phase 9). Lists the indexable, customer-facing storefront
 * routes. Product detail pages are dynamic by id and are emitted (when the
 * store runs) through their own `alternates`/OG metadata; keeping the sitemap
 * static avoids a Mongo dependency at build time while still exposing the
 * entry points a crawler needs.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const now = new Date();

  return [
    { url: `${base}/store`, lastModified: now, priority: 1 },
    { url: `${base}/store/track`, lastModified: now, priority: 0.4 },
    { url: `${base}/store/cart`, lastModified: now, priority: 0.3 },
  ];
}