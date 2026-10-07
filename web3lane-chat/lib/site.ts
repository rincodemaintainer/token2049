import type { Metadata } from "next";

export const siteOrigin = process.env.SITE_URL || "https://web3lane.vercel.app";
export const description = "Plan wallet QA with an AI agent. Define your dApp journey, review the test plan, and inspect the evidence with web3lane.";

export function pageMetadata(title: string, path: string, summary = description): Metadata {
  return {
    title,
    description: summary,
    alternates: siteOrigin ? { canonical: path } : undefined,
    openGraph: { title, description: summary, type: "website", siteName: "web3lane", url: siteOrigin ? path : undefined, images: [{ url: "/thumbnail.webp", width: 1200, height: 675, alt: "web3lane wallet QA agent: understand the app, plan the test, capture the proof" }] },
    twitter: { card: "summary_large_image", title, description: summary, images: ["/thumbnail.webp"] },
  };
}
