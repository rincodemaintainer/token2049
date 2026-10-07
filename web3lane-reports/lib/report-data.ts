import { promises as fs } from "node:fs";
import path from "node:path";

export type CommentarySection = "run" | "recovery" | "verdict" | "checks";

export interface AgentCommentary {
  schemaVersion: 1;
  summary: string;
  comments: Array<{ section: CommentarySection; text: string }>;
  author: string;
  createdAt: string;
}

export interface ReportData {
  schemaVersion: 1;
  title?: string;
  run?: Record<string, unknown> | null;
  recovery?: Record<string, unknown> | string | null;
  verdict?: Record<string, unknown> | string | null;
  stages?: Stage[];
  checks?: Check[];
  metrics?: Metric[];
  timeline?: TimelineEntry[];
  media?: Media;
  files?: EvidenceFile[];
  job?: JobBinding | null;
  execution?: ExecutionRecord | null;
  caseResults?: CaseResult[] | null;
  generatedAt?: string;
  agentCommentary?: AgentCommentary | null;
}

export interface Stage { title: string; description?: string; image?: string | null; log?: string | null; provenance?: string; }
export interface Check { name: string; status?: EvidenceStatus; detail?: string; evidence?: string; }
export interface Metric { label: string; value: string | number; unit?: string; status?: EvidenceStatus; detail?: string; }
export interface TimelineEntry { at?: string; label: string; status?: EvidenceStatus; detail?: string; }
export interface EvidenceFile { path: string; label?: string; kind?: string; bytes?: number; sha256?: string; source?: string; }
export interface MediaRecording { path: string; label?: string; scope?: string; }
export interface Media { recordings?: MediaRecording[]; video?: string | null; trace?: string | null; }
export interface JobBinding { binding_state?: string; job_id?: string | null; plan_version?: string | null; approved_plan_hash?: string | null; approved_plan_artifact?: string | null; detail?: string; }
export interface ExecutionRecord {
  schemaVersion: 1;
  payment_job_id?: string | null;
  input_hash?: string | null;
  approved_job_id?: string | null;
  plan_version?: string | null;
  approved_plan_hash?: string | null;
  session_id?: string | null;
  started_at?: string | null;
  recorded_at?: string | null;
  record_artifact?: string | null;
  record_sha256?: string | null;
}
export type CaseOutcome = "PASS" | "FLAKY" | "FAIL" | "BLOCKED" | "INCONCLUSIVE" | "RUNNER_ERROR" | "NOT_RUN";
export type CauseCategory = "app_behavior" | "missing_prerequisite" | "runner_automation" | "external_dependency" | "specification_gap" | "policy_violation" | "unknown";
export interface CaseResult {
  case_id: string;
  outcome: CaseOutcome;
  attempts_used?: number;
  attempts?: number;
  expected?: string;
  observed?: string;
  cause_category: CauseCategory | null;
  attribution_status?: string;
  event_ids?: string[];
  evidence_refs: string[];
  attempt_history?: Array<{
    attempt: number;
    outcome: CaseOutcome;
    expected?: string;
    observed?: string;
    evidence?: { present: string[]; missing: string[] };
    cause_category?: CauseCategory | null;
  }>;
}
export type EvidenceStatus = "pass" | "fail" | "warn" | "unknown";

export interface EvidenceManifest {
  files?: Array<{ path?: string; sha256?: string; bytes?: number; mediaType?: string }>;
  [key: string]: unknown;
}

export interface ReportBundle {
  slug: string;
  report: ReportData;
  manifest: EvidenceManifest;
}

const reportsRoot = path.join(process.cwd(), "public", "evidence");
const safeSlug = /^[a-z0-9][a-z0-9-]*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCommentary(value: unknown): value is AgentCommentary {
  if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.summary !== "string" ||
    typeof value.author !== "string" || typeof value.createdAt !== "string" || !Array.isArray(value.comments)) return false;
  return value.comments.every((comment) => isRecord(comment) &&
    (comment.section === "run" || comment.section === "recovery" || comment.section === "verdict" || comment.section === "checks") &&
    typeof comment.text === "string");
}

function isReportData(value: unknown): value is ReportData {
  return isRecord(value) && value.schemaVersion === 1 &&
    (value.agentCommentary === undefined || value.agentCommentary === null || isCommentary(value.agentCommentary));
}

export async function listReportSlugs(): Promise<string[]> {
  try {
    const entries = await fs.readdir(reportsRoot, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory() && safeSlug.test(entry.name)).map((entry) => entry.name).sort();
  } catch (error: unknown) {
    if (isRecord(error) && error.code === "ENOENT") return [];
    throw error;
  }
}

export async function readReportBundle(slug: string): Promise<ReportBundle | null> {
  if (!safeSlug.test(slug)) return null;
  try {
    const bundlePath = path.join(reportsRoot, slug);
    const [reportText, manifestText] = await Promise.all([
      fs.readFile(path.join(bundlePath, "report-data.json"), "utf8"),
      fs.readFile(path.join(bundlePath, "manifest.json"), "utf8"),
    ]);
    const report: unknown = JSON.parse(reportText);
    const manifest: unknown = JSON.parse(manifestText);
    if (!isReportData(report) || !isRecord(manifest)) return null;
    return { slug, report, manifest };
  } catch (error: unknown) {
    if (isRecord(error) && (error.code === "ENOENT" || error instanceof SyntaxError)) return null;
    throw error;
  }
}

export function artifactUrl(slug: string, artifactPath: string): string | null {
  const normal = artifactPath.replaceAll("\\", "/");
  if (!normal || normal.startsWith("/") || normal.split("/").some((part) => part === "" || part === "." || part === "..")) return null;
  return `/evidence/${encodeURIComponent(slug)}/${normal.split("/").map(encodeURIComponent).join("/")}`;
}

export function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Not recorded";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}
