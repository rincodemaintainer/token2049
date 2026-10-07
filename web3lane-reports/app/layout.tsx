import type { Metadata } from "next";
import "./base.css";

export const metadata: Metadata = {
  title: "web3lane reports",
  description: "Static evidence reports for wallet QA runs.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
