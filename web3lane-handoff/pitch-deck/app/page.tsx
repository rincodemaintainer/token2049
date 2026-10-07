"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, FileCheck2, List, Pause, Wallet, X } from "lucide-react";

const slides = [
  {
    title: "The button is not the proof", theme: "forest",
    content: <div className="cover">
      <p className="cover-brand">PRODUCT VISION <span>·</span> 7 OCT 2026</p>
      <h1>The button<br />is not <em>the proof.</em></h1>
      <p className="cover-intro">Agree on the test. Run a real wallet journey. Keep the evidence.</p>
      <div className="cover-sequence" aria-label="Browser, wallet, and chain evidence sequence">
        <div><b>01</b><span>Browser</span><small>What the app showed</small></div>
        <div><b>02</b><span>Wallet</span><small>What was approved</small></div>
        <div><b>03</b><span>Chain</span><small>What settled</small></div>
      </div>
    </div>,
  },
  {
    title: "Where a browser test stops", theme: "moss",
    content: <div className="blindspot">
      <div className="editorial-head"><p className="chapter">01 / THE GAP</p><h2>A green button<br />can hide a failed swap.</h2></div>
      <div className="blindspot-table" role="table" aria-label="Evidence a browser-only test may miss">
        <div role="row"><span role="cell">App UI</span><strong role="cell">“Success”</strong><span role="cell" className="state-seen">Seen by browser</span></div>
        <div role="row"><span role="cell">Wallet prompt</span><strong role="cell">Signed?</strong><span role="cell" className="state-unknown">Unknown</span></div>
        <div role="row"><span role="cell">Chain receipt</span><strong role="cell">Settled?</strong><span role="cell" className="state-unknown">Unknown</span></div>
      </div>
      <p className="closing-line">web3lane joins these records before it calls a case passed.</p>
    </div>,
  },
  {
    title: "The approved plan", theme: "paper",
    content: <div className="plan-slide">
      <div className="editorial-head"><p className="chapter">02 / BEFORE EXECUTION</p><h2>The buyer sets<br />the truth.</h2><p>Assertions and limits are approved before a wallet action.</p></div>
      <div className="plan-document" aria-label="Illustrative approved test plan">
        <div className="document-head"><span>TEST PLAN</span><span>SWAP–01 / v1</span><span>ILLUSTRATIVE</span></div>
        <div className="document-title">Expected behavior</div>
        <div className="document-row"><span>01</span><strong>Network and account</strong><small>Confirmed</small></div>
        <div className="document-row"><span>02</span><strong>Finite approval</strong><small>Exact amount</small></div>
        <div className="document-row"><span>03</span><strong>Swap receipt</strong><small>Required</small></div>
        <div className="document-row"><span>04</span><strong>Success notice</strong><small>Expected</small></div>
        <div className="document-foot"><FileCheck2 aria-hidden="true" /><span>Execution waits for this version to be approved.</span></div>
      </div>
      <p className="provenance">Illustrative plan; no live buyer approval is claimed.</p>
    </div>,
  },
  {
    title: "The execution boundary", theme: "moss",
    content: <div className="boundary-slide">
      <div className="editorial-head"><p className="chapter">03 / CONTROL</p><h2>No matching plan.<br />No signature.</h2></div>
      <div className="policy-sheet">
        <div className="policy-title"><Wallet aria-hidden="true" /><span>Proposed wallet request</span><ArrowRight aria-hidden="true" /><strong>Policy decision</strong></div>
        <div className="policy-row"><span>Chain + domain</span><span>must match</span><Check aria-hidden="true" /></div>
        <div className="policy-row"><span>Contract + spender</span><span>must match</span><Check aria-hidden="true" /></div>
        <div className="policy-row"><span>Amount + gas cap</span><span>within limit</span><Check aria-hidden="true" /></div>
        <div className="policy-row"><span>Action + count</span><span>within limit</span><Check aria-hidden="true" /></div>
      </div>
      <div className="boundary-rule"><Pause aria-hidden="true" /><p>Unknown transaction state? Inspect the receipt and nonce before another signature.</p></div>
      <p className="provenance">Policy core is tested. Live helper enforcement remains unverified.</p>
    </div>,
  },
  {
    title: "One observed swap, two results", theme: "forest",
    content: <div className="run-slide">
      <div className="editorial-head"><p className="chapter">04 / RECORDED RUN · 7 OCT 2026</p><h2>The swap landed.<br />The test failed.</h2></div>
      <div className="run-measure"><div><span>Sent</span><strong>0.01 <small>QMS</small></strong></div><ArrowRight aria-hidden="true" /><div><span>Received onchain</span><strong>0.009915 <small>USDC</small></strong></div></div>
      <div className="run-tracks">
        <div><span className="track-number">01</span><Check aria-hidden="true" /><strong>Chain receipt</strong><span>Confirmed · block 59097</span></div>
        <div><span className="track-number">02</span><X aria-hidden="true" /><strong>Playwright case</strong><span>Failed · explorer tab absent</span></div>
      </div>
      <p className="provenance">Read-only RPC reconciliation supports the onchain result; the browser run has stated evidence limits.</p>
    </div>,
  },
  {
    title: "The evidence packet", theme: "moss",
    content: <div className="packet-slide">
      <div className="editorial-head"><p className="chapter">05 / THE DELIVERABLE</p><h2>Proof you can inspect.</h2><p>One job, with the gaps left visible.</p></div>
      <div className="packet-summary"><div><strong>36</strong><span>artifacts</span></div><div><strong>8</strong><span>screenshots</span></div><div><strong>1</strong><span>recording</span></div></div>
      <div className="packet-evidence"><div className="packet-ledger" role="table" aria-label="Recorded evidence bundle">
        <div role="row"><span role="cell">Run recording</span><span role="cell">Included</span></div>
        <div role="row"><span role="cell">Wallet + app screenshots</span><span role="cell">Included</span></div>
        <div role="row"><span role="cell">RPC receipt proof</span><span role="cell">Matched</span></div>
        <div role="row" className="missing"><span role="cell">Browser trace</span><span role="cell">Did not finalize</span></div>
      </div><figure className="packet-recording"><video controls preload="metadata" aria-label="Qwap app recording from the observed test run"><source src="/qwap-app-recording.webm" type="video/webm" /></video><figcaption>30 s app clip: Qwap submit to success. Wallet popups are in screenshots.</figcaption></figure></div>
      <p className="provenance">Counts from the local 7 Oct evidence export. A missing trace is not treated as present.</p>
    </div>,
  },
  {
    title: "Two separate ledgers", theme: "moss",
    content: <div className="payment-slide">
      <div className="editorial-head"><p className="chapter">06 / PAYMENT · PLANNED</p><h2>Pay for the QA run.<br />Keep test funds separate.</h2></div>
      <div className="ledger-columns">
        <div><span>LEDGER A</span><strong>QA service</strong><p>Masumi escrow on Cardano</p><small>Did the service deliver the agreed test?</small></div>
        <div><span>LEDGER B</span><strong>Testnet funds</strong><p>Used for the wallet journey</p><small>Did the app behave as expected?</small></div>
      </div>
      <p className="payment-resolution">A contested delivery goes to human review.</p>
      <p className="provenance">Escrow, paid jobs, and refund review are planned; not live verified.</p>
    </div>,
  },
  {
    title: "What is proven next", theme: "forest",
    content: <div className="close-slide">
      <div className="editorial-head"><p className="chapter">07 / CURRENT STATE</p><h2>Core built.<br />Loop not closed.</h2></div>
      <div className="close-ledger"><div><span>BUILT</span><strong>60 unit tests + typecheck</strong><small>Planning, policy, outcomes, report logic</small></div><div><span>OBSERVED</span><strong>One real testnet swap</strong><small>Receipt confirmed; Playwright case failed</small></div><div><span>NEXT</span><strong>Repeatable browser proof + paid job</strong><small>Complete trace, sealed evidence, Masumi flow</small></div></div>
      <p className="close-statement">Make every wallet test inspectable.</p>
      <p className="provenance">Status from the prototype README and local 7 Oct report.</p>
    </div>,
  },
] as const;

function SlideBrand() {
  return <><div className="slide-watermark" aria-hidden="true" /><div className="slide-brand"><span className="wallet-brand">WEB3LANE</span><img className="origins-logo" src="/token2049-origins-logo.png" alt="TOKEN2049 Origins" /></div></>;
}

export default function DeckPage() {
  const [index, setIndex] = useState(0);
  const [overview, setOverview] = useState(false);

  useEffect(() => {
    const fromHash = Number(window.location.hash.slice(1));
    if (fromHash >= 1 && fromHash <= slides.length) setIndex(fromHash - 1);
  }, []);

  useEffect(() => { window.history.replaceState(null, "", `#${index + 1}`); }, [index]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (["ArrowRight", "ArrowDown", "PageDown"].includes(event.key)) { event.preventDefault(); setIndex(i => Math.min(i + 1, slides.length - 1)); setOverview(false); }
      if (["ArrowLeft", "ArrowUp", "PageUp"].includes(event.key)) { event.preventDefault(); setIndex(i => Math.max(i - 1, 0)); setOverview(false); }
      if (event.key === "Home") setIndex(0);
      if (event.key === "End") setIndex(slides.length - 1);
      if (event.key === "Escape") setOverview(false);
      if (event.key.toLowerCase() === "o") setOverview(value => !value);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return <main className="presentation">
    <div className="deck-frame"><section className={`slide theme-${slides[index].theme}`} aria-label={`Slide ${index + 1} of ${slides.length}: ${slides[index].title}`}>
      <SlideBrand />
      {slides[index].content}
      <div className="slide-folio"><span>WEB3LANE / PRODUCT VISION</span><span>{String(index + 1).padStart(2, "0")} — {String(slides.length).padStart(2, "0")}</span></div>
    </section></div>
    <nav className="deck-controls" aria-label="Presentation controls"><button onClick={() => setIndex(i => Math.max(i - 1, 0))} disabled={index === 0} aria-label="Previous slide"><ArrowLeft /></button><span>{String(index + 1).padStart(2, "0")} / {String(slides.length).padStart(2, "0")}</span><button onClick={() => setIndex(i => Math.min(i + 1, slides.length - 1))} disabled={index === slides.length - 1} aria-label="Next slide"><ArrowRight /></button><button onClick={() => setOverview(true)} aria-label="Open slide list"><List /></button></nav>
    {overview && <div className="overview" role="dialog" aria-modal="true" aria-label="Slide list"><div className="overview-inner"><div className="overview-top"><strong>Slides</strong><button onClick={() => setOverview(false)} aria-label="Close slide list"><X /></button></div>{slides.map((slide, i) => <button className="overview-row" key={slide.title} onClick={() => { setIndex(i); setOverview(false); }}><span>{String(i + 1).padStart(2, "0")}</span><strong>{slide.title}</strong><ArrowRight /></button>)}</div></div>}
    <div className="print-deck" aria-hidden="true">{slides.map((slide, i) => <section key={slide.title} className={`slide theme-${slide.theme}`}><SlideBrand />{slide.content}<div className="slide-folio"><span>WEB3LANE / PRODUCT VISION</span><span>{String(i + 1).padStart(2, "0")} — {String(slides.length).padStart(2, "0")}</span></div></section>)}</div>
  </main>;
}
