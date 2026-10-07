import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export function SiteShell({ children }: { children: React.ReactNode }) {
  return <div className="site-shell">
    <header className="site-header">
      <Link className="brand" href="/" aria-label="web3lane home"><img src="/mark.svg" alt="" width={30} height={30} />web3lane</Link>
      <Link className="site-text-link" href="/chat">Open QA chat <ArrowUpRight size={16} aria-hidden="true" /></Link>
    </header>
    {children}
    <footer className="site-footer"><span>web3lane · Built for better wallet journeys.</span><nav aria-label="Legal"><Link href="/terms">Terms of Service</Link><Link href="/privacy">Privacy Policy</Link></nav></footer>
  </div>;
}
