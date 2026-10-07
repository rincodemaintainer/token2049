import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { SiteShell } from "@/components/site-shell";
import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata("web3lane · Wallet QA, with the proof", "/");

export default function Page() {
  return <SiteShell><main>
    <section className="landing-hero">
      <div><h1>Wallet QA,<br />with the proof.</h1><p>Turn your dApp journey into a clear test plan. Work with an AI agent to define expectations, review actions, and inspect the evidence.</p><div className="landing-actions"><Link className="site-button" href="/chat">Plan a wallet test <span aria-hidden="true">↗</span></Link><Link className="site-text-link" href="/testing-guide">See the testing guide</Link></div></div>
      <figure className="landing-image"><Image src="/thumbnail.webp" alt="Wallet QA agent: understand the app, plan the test, run wallet flows, capture the proof." width={1200} height={675} priority sizes="(max-width: 800px) 100vw, 55vw" /><figcaption>Built at TOKEN2049 Origins Hackathon · 2026</figcaption></figure>
    </section>
    <section className="landing-workflow" aria-labelledby="workflow-title"><h2 id="workflow-title">From intent to evidence.</h2><ol>
      <li><h3>Define the journey</h3><p>Share the target app, wallet flow, network, and expected behavior.</p></li>
      <li><h3>Review the plan</h3><p>Clarify test cases, permissions, and limits before approving actions.</p></li>
      <li><h3>Inspect the proof</h3><p>Review tool output and available run evidence. Keep missing proof visible.</p></li>
    </ol><p className="landing-scope">Current browser journey: Qwap/QMS. Live execution needs a configured runner; payments and settlement use a separate service.</p></section>
    <section className="landing-report" aria-labelledby="report-title">
      <div className="landing-report-copy"><h2 id="report-title">See what the evidence looks like.</h2><p>A real Qwap wallet journey, captured in one report. Inspect the verdict, browser checks, screenshots, and transaction evidence together.</p><p className="landing-report-note">This sample confirms chain settlement and records a failed browser check. The report keeps both outcomes visible.</p><a className="site-text-link" href="/report-preview.png" target="_blank" rel="noopener noreferrer">Open full report image <ArrowUpRight size={16} aria-hidden="true" /></a></div>
      <figure className="landing-report-image"><div className="landing-report-scroll" tabIndex={0} role="region" aria-label="Full report screenshot; scroll to inspect"><Image src="/report-preview.webp" alt="Full Web3lane Qwap evidence report showing an inconclusive verdict, confirmed chain settlement, browser checks, stage screenshots, recordings, and artifact inventory." width={1440} height={6329} sizes="(max-width: 800px) 100vw, 60vw" /></div><figcaption>Full-page capture · Qwap swap evidence · Scroll to inspect</figcaption></figure>
    </section>
  </main></SiteShell>;
}
