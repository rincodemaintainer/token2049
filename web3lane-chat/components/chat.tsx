"use client";

import { useEffect, useRef, useState } from "react";
import { openConversationInputs, useEveAgent } from "eve/react";
import { ArrowUp, Check, ChevronRight, Download, LoaderCircle, MessageSquare, Plus, RefreshCw, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessagePart } from "@/components/message-part";
import { journey } from "@/lib/journey";

const STORAGE_KEY = "web3lane-qa-session";

export function Chat() {
  const [saved, setSaved] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    try { setSaved(sessionStorage.getItem(STORAGE_KEY)); } catch { setSaved(null); }
  }, []);
  if (saved === undefined) return <main className="loading" aria-busy="true">Opening QA workspace…</main>;
  return <Workspace savedSession={saved} />;
}

function Workspace({ savedSession }: { savedSession: string | null }) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [connection, setConnection] = useState("Checking connection");
  const [checking, setChecking] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [answering, setAnswering] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [nearBottom, setNearBottom] = useState(true);
  const log = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const pendingMessage = useRef("");
  const agent = useEveAgent({
    host: "/api/agent",
    initialSession: savedSession ? { sessionId: savedSession, streamIndex: 0 } : undefined,
    resume: !!savedSession,
    onSessionChange(session) {
      try {
        if (session) sessionStorage.setItem(STORAGE_KEY, session.sessionId);
        else sessionStorage.removeItem(STORAGE_KEY);
      } catch { /* Chat remains usable when browser storage is unavailable. */ }
    },
    onError(err) {
      setError(err.message);
      const message = pendingMessage.current;
      if (message) setDraft((current) => current || message);
    },
  });
  const busy = agent.status === "submitted" || agent.status === "streaming";
  const resuming = agent.status === "resuming";
  const requests = openConversationInputs(agent.data).map((input) => input.request);

  async function checkConnection() {
    setChecking(true);
    try {
      const health = await fetch("/api/agent/eve/v1/health", { signal: AbortSignal.timeout(15000) });
      const result = await health.json();
      if (!health.ok) throw new Error(result.error ?? `Agent returned HTTP ${health.status}`);
      if (result.ok !== true || result.status !== "ready" || typeof result.workflowId !== "string") throw new Error("URL is reachable but is not an Eve agent.");
      const info = await fetch("/api/agent/eve/v1/info", { signal: AbortSignal.timeout(15000) });
      if (!info.ok) throw new Error(info.status === 401 || info.status === 403 ? "Agent reachable · authentication required" : `Agent inspection failed (HTTP ${info.status})`);
      const details = await info.json();
      if (!details.agent) throw new Error("Unexpected agent inspection response.");
      setConnection("Agent connected");
    } catch (err) { setConnection(err instanceof Error ? err.message : "Connection failed. Check .env and retry."); }
    finally { setChecking(false); }
  }
  useEffect(() => { void checkConnection(); }, []);
  useEffect(() => {
    if (nearBottom && log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [agent.data.messages, requests.length, nearBottom]);

  async function send() {
    const message = draft.trim();
    if (!message || busy || resuming || requests.length) return;
    setError(""); setDraft(""); setNearBottom(true);
    pendingMessage.current = message;
    try { await agent.send(message); }
    catch (err) { setError(err instanceof Error ? err.message : "Message failed. Retry when connected."); setDraft((current) => current || message); }
    finally { pendingMessage.current = ""; }
  }
  function usePrompt(prompt: string) { setDraft(prompt); composer.current?.focus(); }
  function exportTranscript() {
    const transcript = { sessionId: agent.session?.sessionId, exportedAt: new Date().toISOString(), messages: agent.data.messages.map((message) => ({ ...message, parts: message.parts.filter((part) => part.type !== "reasoning") })) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(transcript, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "web3lane-session.json"; anchor.click(); URL.revokeObjectURL(url);
  }

  return <div className="workspace">
    <aside className="rail">
      <a className="brand" href="/" aria-label="web3lane home"><img src="/mark.svg" alt="" width={30} height={30} />web3lane<span>QA</span></a>
      <Button variant="outline" className="new-chat" disabled={busy || resuming || requests.length > 0} onClick={() => { agent.reset(); setError(""); setDraft(""); setAnswers({}); }}><Plus />New conversation</Button>
      <div className="active-nav"><MessageSquare size={16} />Agent workspace</div>
      <div className="journey-heading"><h2>Test journey</h2><span>Guide</span></div>
      <ol className="journey">{journey.map((step, index) => <li key={step.title}><button onClick={() => usePrompt(step.prompt)}><span className="step-number">{index + 1}</span><span><strong>{step.title}</strong><small>{step.detail}</small></span><ChevronRight size={14} /></button></li>)}</ol>
      <div className="rail-note"><strong>Agreement before execution.</strong><p>Review scope and spending before approving. Chat replies alone do not prove funding or test completion.</p></div>
      <a className="guide-link" href="/testing-guide">Full-flow test checklist <ChevronRight size={14} /></a>
    </aside>
    <main className="main">
      <header className="topbar"><div><strong>QA agent</strong><span>Conversation & evidence</span></div><Button variant="ghost" size="sm" disabled={!agent.data.messages.length} onClick={exportTranscript}><Download />Export chat</Button></header>
      <div className="connection-bar"><span className={connection === "Agent connected" ? "connected" : ""}>{connection === "Agent connected" && <Check size={13} />}{connection}</span><Button variant="ghost" size="sm" disabled={checking} onClick={() => void checkConnection()} aria-label="Recheck agent connection"><RefreshCw className={checking ? "spin" : ""} /></Button></div>
      <div className="conversation" ref={log} onScroll={() => { const node = log.current; if (node) setNearBottom(node.scrollHeight - node.scrollTop - node.clientHeight < 100); }}>
        {!agent.data.messages.length && !resuming ? <section className="welcome"><div className="agent-symbol"><img src="/mark.svg" width={42} height={42} alt="" /></div><h1>What should we test?</h1><p>Start with your app’s URL and the journey that needs to work. We’ll turn it into clear requirements, a bounded plan, and evidence you can review.</p><div className="starters"><button onClick={() => usePrompt(journey[0].prompt)}><span>Plan a wallet journey</span><ArrowUp size={16} /></button><button onClick={() => usePrompt("Inspect [deployed URL] for a wallet connection test. Transactions are not permitted. Identify the network, wallet prerequisites, expected connected state and required proof. Ask essential questions before planning execution.")}><span>Check wallet connection</span><ArrowUp size={16} /></button></div><p className="welcome-note">Your test starts with a conversation. Execution requires explicit approval.</p></section> : <div className="messages" role="log" aria-label="QA conversation" aria-live="polite" aria-relevant="additions">{agent.data.messages.map((message) => <article key={message.id} className={`message ${message.role}`}><div className="message-author">{message.role === "user" ? "You" : "web3lane"}{message.metadata?.status === "failed" && <span>Delivery unconfirmed</span>}</div>{message.parts.map((part, index) => <MessagePart key={"id" in part ? part.id ?? index : index} part={part} />)}</article>)}</div>}
        {resuming && <p className="run-status" role="status"><LoaderCircle className="spin" size={15} />Restoring session…</p>}
        {busy && <p className="run-status" role="status"><LoaderCircle className="spin" size={15} />{requests.length ? "Waiting for your response" : "Agent working…"}</p>}
        {requests.map((request) => <fieldset className="input-request" disabled={resuming || answering === request.requestId} key={request.requestId}><legend>{request.kind === "tool-approval" ? "Approval required" : request.kind === "question" ? "Your input is needed" : "Session limit"}</legend><p>{request.prompt}</p><details><summary>Review requested action</summary><pre>{JSON.stringify(request.action, null, 2)}</pre></details><div className="answer-options">{request.options?.map((option) => <Button variant={option.style === "primary" ? "default" : "outline"} title={option.description} key={option.id} onClick={async () => { setAnswering(request.requestId); setError(""); try { await agent.respond([{ requestId: request.requestId, optionId: option.id }]); } catch (err) { setError(err instanceof Error ? err.message : "Response failed"); } finally { setAnswering(null); } }}>{option.label}</Button>)}</div>{request.allowFreeform && <form onSubmit={async (event) => { event.preventDefault(); const text = answers[request.requestId]?.trim(); if (!text) return; setAnswering(request.requestId); setError(""); try { await agent.respond([{ requestId: request.requestId, text }]); } catch (err) { setError(err instanceof Error ? err.message : "Response failed"); } finally { setAnswering(null); } }}><label htmlFor={request.requestId}>Your answer</label><Textarea id={request.requestId} value={answers[request.requestId] ?? ""} onChange={(event) => setAnswers({ ...answers, [request.requestId]: event.target.value })} required /><Button type="submit" size="sm">Send answer</Button></form>}</fieldset>)}
      </div>
      <div className="composer-area">{(error || agent.error) && <div role="alert" className="error-message">{error || agent.error?.message}<p>Check connection and configuration; reconnect before resending. Expired sessions need a new conversation.</p><Button variant="outline" size="sm" disabled={busy || resuming} onClick={async () => { setError(""); try { await agent.resume(); } catch (err) { setError(err instanceof Error ? err.message : "Reconnect failed"); } }}>Reconnect session</Button></div>}
        <form className="composer" onSubmit={(event) => { event.preventDefault(); void send(); }}><label htmlFor="message" className="sr-only">Message the QA agent</label><Textarea ref={composer} id="message" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Describe your app, testing goal, and limits…" disabled={resuming} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} /><div className="composer-bottom"><span>{requests.length ? "Answer the pending request above" : "Enter to send · Shift + Enter for a new line"}</span>{busy ? <Button variant="outline" size="sm" type="button" disabled={stopping} onClick={async () => { setStopping(true); try { await agent.cancel(); } catch (err) { setError(err instanceof Error ? err.message : "Could not stop agent"); } finally { setStopping(false); } }}><Square />{stopping ? "Stopping…" : "Stop"}</Button> : <Button type="submit" size="icon" disabled={!draft.trim() || resuming || requests.length > 0} aria-label="Send message"><ArrowUp /></Button>}</div></form>
        <footer><span>Keep wallet secrets out of chat.</span><span>{agent.session ? `Session ${agent.session.sessionId.slice(0, 16)}…` : "No session started"}</span></footer>
      </div>
    </main>
  </div>;
}
