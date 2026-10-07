"use client";

import type { EveMessagePart } from "eve/react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Wrench } from "lucide-react";

function safeUrl(value?: string) {
  if (!value) return undefined;
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? value : undefined; } catch { return undefined; }
}

export function MessagePart({ part }: { part: EveMessagePart }) {
  if (part.type === "text") return <div className="prose"><Markdown remarkPlugins={[remarkGfm]} components={{ a: ({ href, children }) => <a href={safeUrl(href)} target="_blank" rel="noopener noreferrer">{children}</a>, img: ({ alt }) => <span>[Image: {alt}]</span> }}>{part.text}</Markdown></div>;
  if (part.type === "dynamic-tool") return <details className="tool-result"><summary><Wrench size={14} /><span>{part.toolName.replaceAll("_", " ")}</span><small>{part.state.replaceAll("-", " ")}</small></summary><pre>{JSON.stringify({ input: part.input, output: part.output, error: part.errorText }, null, 2)}</pre></details>;
  if (part.type === "authorization") return <div className="authorization"><strong>{part.displayName}</strong><p>{part.description}</p>{part.state === "completed" ? <p>{part.outcome}</p> : <><p>{part.authorization?.instructions}</p>{part.authorization?.userCode && <code>{part.authorization.userCode}</code>}{safeUrl(part.authorization?.url) && <a href={safeUrl(part.authorization?.url)} target="_blank" rel="noopener noreferrer">Open sign-in</a>}</>}</div>;
  if (part.type === "file") return safeUrl(part.url) ? <a href={safeUrl(part.url)} target="_blank" rel="noopener noreferrer">{part.filename ?? "View attachment"}</a> : <p>{part.filename ?? "Attachment"} · No browser-accessible link</p>;
  return null;
}
