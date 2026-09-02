import type { MetadataRoute } from "next";

/**
 * Search-engine crawl rules.
 *
 * The internal application is an authenticated, non-indexable business system
 * (`robots: noindex` on the dashboard layout), while the public online store at
 * `/store` is indexable and customer-facing. We publish a robots.txt that allows
 * the public store and blocks the private routes.
 */
export default function robots(): MetadataRoute.Robots {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/store", "/store/products", "/store/track"],
        disallow: ["/", "/pos", "/cafe", "/kds", "/inventory", "/accounting", "/login"],
      },
    ],
    sitemap: `${appUrl}/sitemap.xml`,
  };
}