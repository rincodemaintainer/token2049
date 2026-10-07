import type { Metadata } from "next";
import "@fontsource-variable/plus-jakarta-sans";
import "./globals.css";
import { siteOrigin } from "@/lib/site";

export const metadata: Metadata = { metadataBase: new URL(siteOrigin || "http://localhost:3001"), title: "web3lane", icons: { icon: "/mark.svg" } };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
