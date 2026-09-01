import type { MetadataRoute } from "next";

/**
 * Search-engine crawl rules.
 *
 * The application is an internal business system: every page is either behind
 * authentication or the login screen, both of which carry `<meta name="robots"
 * content="noindex">`. We still publish a valid robots.txt so crawlers never
 * chase the auth-redirect dance, and so the future online store can be exposed
 * at its own paths without a separate file.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
      },
    ],
  };
}