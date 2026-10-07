import type { Metadata } from "next";
import "./base.css";

export const metadata: Metadata = {
  title: "web3lane · Evidence report",
  description: "Recorded wallet QA results and the evidence behind them.",
  icons: { icon: "/mark.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><a className="skip-link" href="#report">Skip to report</a><header className="site-header"><a className="brand" href="#report" aria-label="web3lane report"><img src="/mark.svg" alt="" width={38} height={38} /><span>web3lane</span></a><nav aria-label="Report sections"><a href="#report">Overview</a><a href="#checks">Checks</a><a href="#evidence">Evidence</a></nav><span className="header-label">Wallet QA</span></header>{children}<footer className="site-footer"><a className="brand" href="#report"><img src="/mark.svg" alt="" width={26} height={26} /><span>web3lane</span></a><span>Recorded results. Inspectable evidence.</span><a href="#report">Back to overview</a></footer></body></html>;
}
