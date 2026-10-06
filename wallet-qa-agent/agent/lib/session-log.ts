import { createHash } from "node:crypto";
import type { SessionEvent } from "./types.ts";

export type AppendEventInput = Omit<SessionEvent, "seq" | "event_id"> & {
  event_id?: string;
};

/**
 * Monotonically sequenced append-only session event stream.
 * Credentials and secrets must never appear in details.
 */
export class SessionLog {
  readonly session_id: string;
  readonly job_id: string;
  private events: SessionEvent[] = [];
  private nextSeq = 1;

  constructor(job_id: string, session_id?: string) {
    this.job_id = job_id;
    this.session_id = session_id ?? `session-${job_id}`;
  }

  append(input: AppendEventInput): SessionEvent {
    const event: SessionEvent = {
      seq: this.nextSeq++,
      event_id: input.event_id ?? `EV-${String(this.nextSeq - 1).padStart(3, "0")}`,
      job_id: this.job_id,
      plan_version: input.plan_version,
      timestamp: input.timestamp,
      case_id: input.case_id,
      step_id: input.step_id,
      attempt: input.attempt,
      actor: input.actor,
      action: input.action,
      details: sanitizeDetails(input.details),
      evidence_refs: [...input.evidence_refs],
      recording_offset_seconds: input.recording_offset_seconds ?? null,
      recording_id: input.recording_id ?? null,
      session_id: this.session_id,
      usage_snapshot: input.usage_snapshot
        ? sanitizeDetails(input.usage_snapshot)
        : undefined,
    };
    this.events.push(event);
    return cloneEvent(event);
  }

  list(): readonly SessionEvent[] {
    return this.events.map(cloneEvent);
  }

  forCase(case_id: string): SessionEvent[] {
    return this.events.filter((e) => e.case_id === case_id).map(cloneEvent);
  }

  toJsonl(): string {
    return this.events.map((e) => JSON.stringify(e)).join("\n") + "\n";
  }

  digest(): string {
    return createHash("sha256").update(this.toJsonl()).digest("hex");
  }
}

const SECRET_KEYS = [
  "private_key",
  "seed",
  "mnemonic",
  "password",
  "pin",
  "secret",
  "credentials",
  "authorization",
  "api_key",
];

export function sanitizeDetails(
  details: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (isSecretKey(key)) {
      defineValue(out, key, "omitted");
      continue;
    }
    defineValue(out, key, sanitizeValue(value));
  }
  return out;
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (value && typeof value === "object") {
    return sanitizeDetails(value as Record<string, unknown>);
  }
  return value;
}

function isSecretKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return SECRET_KEYS.some((secret) =>
    normalized.includes(secret.replace(/[^a-z0-9]/g, "")),
  ) || ["accesstoken", "authtoken", "bearertoken", "idtoken", "refreshtoken", "cookie"].some(
    (secret) => normalized.includes(secret),
  );
}

function defineValue(target: Record<string, unknown>, key: string, value: unknown) {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

function cloneEvent(event: SessionEvent): SessionEvent {
  return structuredClone(event);
}
