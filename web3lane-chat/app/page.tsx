import Image from "next/image";
import Link from "next/link";
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
  </main></SiteShell>;
}
