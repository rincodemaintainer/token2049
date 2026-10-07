import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/", disallow: ["/chat", "/api/", "/testing-guide"] }, sitemap: `${siteOrigin}/sitemap.xml` };
}
