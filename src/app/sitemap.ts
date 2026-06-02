import type { MetadataRoute } from "next";
import { docsPages } from "@/lib/docs/manifest";
import { absoluteUrl } from "@/lib/site";

const staticRoutes = [
  { path: "/", priority: 1 },
  { path: "/docs", priority: 0.85 },
  { path: "/privacy", priority: 0.35 },
  { path: "/terms", priority: 0.35 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    ...staticRoutes.map((route) => ({
      url: absoluteUrl(route.path),
      lastModified: now,
      changeFrequency: route.path === "/" ? "weekly" as const : "monthly" as const,
      priority: route.priority,
    })),
    ...docsPages.map((page) => ({
      url: absoluteUrl(page.href),
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: page.section === "Guides" ? 0.75 : 0.65,
    })),
  ];
}
