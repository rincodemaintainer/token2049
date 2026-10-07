import { notFound } from "next/navigation";
import Link from "next/link";
import { artifactUrl, displayValue, listReportSlugs, readReportBundle, type CaseOutcome, type EvidenceStatus } from "../../../lib/report-data";
import styles from "../reports.module.css";

export const dynamicParams = false;

export async function generateStaticParams() {
  const slugs = await listReportSlugs();
  // Next's static exporter requires one concrete path for a dynamic route.
  // This sentinel resolves to the existing 404 page and is never listed as a report.
  return (slugs.length === 0 ? ["__no-reports"] : slugs).map((slug) => ({ slug }));
}

function Status({ value }: { value?: EvidenceStatus }) {
  return value ? <span className={`${styles.status} ${styles[`status_${value}`]}`}>{value}</span> : null;
}

function outcomeStatus(outcome: CaseOutcome): EvidenceStatus {
  if (outcome === "PASS") return "pass";
  if (outcome === "FAIL" || outcome === "RUNNER_ERROR") return "fail";
  if (outcome === "FLAKY" || outcome === "BLOCKED" || outcome === "INCONCLUSIVE") return "warn";
  return "unknown";
}

function RecordDetails({ title, value }: { title: string; value: unknown }) {
  return <details className={styles.details}><summary>{title}</summary><pre>{displayValue(value)}</pre></details>;
}

export default async function ReportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const bundle = await readReportBundle(slug);
  if (!bundle) notFound();
  const { report, manifest } = bundle;
  const manifestPaths = new Set((manifest.files ?? []).flatMap((file) => typeof file.path === "string" ? [file.path] : []));
  const recordings = report.media?.recordings ?? [];
  const files = report.files ?? [];
  return <main className={styles.page}>
    <Link className={styles.back} href="/reports">← All reports</Link>
    <header className={styles.header}><p className={styles.eyebrow}>EVIDENCE REPORT / {slug}</p><h1>{report.title || slug}</h1><p>Generated {report.generatedAt || "at an unrecorded time"}. Recorded facts below come from the imported evidence bundle.</p></header>
    <section className={styles.binding}><span>Job binding</span><strong>{report.job?.binding_state || "Not recorded"}</strong><span>Job ID</span><strong>{report.job?.job_id || "Not recorded"}</strong><span>Plan</span><strong>{report.job?.plan_version || "Not recorded"}</strong><span>Manifest files</span><strong>{manifest.files?.length ?? 0}</strong>{report.job?.detail && <p>{report.job.detail}</p>}</section>
    <section className={styles.section}><h2>Execution record</h2>{report.execution ? <div className={styles.execution}>{["payment_job_id", "approved_job_id", "session_id", "plan_version", "input_hash", "approved_plan_hash", "started_at", "recorded_at", "record_artifact", "record_sha256"].map((key) => { const value = report.execution?.[key as keyof typeof report.execution]; return value ? <p key={key}><span>{key.replaceAll("_", " ")}</span><strong>{value}</strong></p> : null; })}</div> : <p className={styles.missing}>No recorded execution. This may be a historical evidence export.</p>}</section>
    {report.caseResults && <section className={styles.section}><h2>Case outcomes</h2><div className={styles.caseResults}>{report.caseResults.map((result) => <article key={result.case_id}><header><Status value={outcomeStatus(result.outcome)} /><strong>{result.case_id}</strong><b>{result.outcome}</b><span>{result.cause_category || "No cause recorded"}</span>{(result.attempts_used ?? result.attempts) !== undefined && <small>{result.attempts_used ?? result.attempts} attempt(s)</small>}</header>{(result.expected || result.observed) && <p><span>Expected: {result.expected || "Not recorded"}</span><span>Observed: {result.observed || "Not recorded"}</span></p>}<div className={styles.caseEvidence}><strong>Evidence</strong>{result.evidence_refs.length === 0 ? <span className={styles.missing}>No evidence refs recorded</span> : result.evidence_refs.map((reference) => { const href = artifactUrl(slug, reference); return href && manifestPaths.has(reference) ? <a key={reference} href={href}>{reference}</a> : <span key={reference}>{reference}</span>; })}</div></article>)}</div></section>}
    <section className={styles.section}><h2>Verdict</h2><div className={styles.verdict}><Status value={report.verdict && typeof report.verdict === "object" && "status" in report.verdict ? report.verdict.status as EvidenceStatus : undefined} />{report.verdict && typeof report.verdict === "object" && "label" in report.verdict && <strong className={styles.verdictLabel}>{String(report.verdict.label)}</strong>}<p>{report.verdict && typeof report.verdict === "object" && "summary" in report.verdict ? String(report.verdict.summary) : displayValue(report.verdict)}</p></div>{report.verdict && typeof report.verdict === "object" && "facts" in report.verdict && Array.isArray(report.verdict.facts) && <div className={styles.facts}>{report.verdict.facts.map((fact: { label?: string; status?: EvidenceStatus; value?: string; detail?: string }, index: number) => <article key={index}><Status value={fact.status} /><strong>{fact.label}</strong><b>{fact.value}</b><span>{fact.detail}</span></article>)}</div>}</section>
    <section className={styles.section}><h2>Checks</h2><div className={styles.rows}>{(report.checks ?? []).map((check, index) => { const href = check.evidence ? artifactUrl(slug, check.evidence) : null; return <article key={index}><Status value={check.status} /><strong>{check.name}</strong><span>{check.detail}</span>{href && manifestPaths.has(check.evidence!) ? <a href={href}>Evidence</a> : check.evidence ? <em className={styles.missing}>Missing proof</em> : null}</article>; })}</div></section>
    <section className={styles.section}><h2>Metrics</h2><div className={styles.metrics}>{(report.metrics ?? []).map((metric, index) => <article key={index}><Status value={metric.status} /><strong>{metric.value} {metric.unit}</strong><span>{metric.label}</span><small>{metric.detail}</small></article>)}</div></section>
    <section className={styles.section}><h2>Timeline</h2><div className={styles.rows}>{(report.timeline ?? []).map((event, index) => <article key={index}><Status value={event.status} /><time>{event.at ? new Date(event.at).toLocaleString("en-GB", { timeZone: "UTC", dateStyle: "medium", timeStyle: "medium" }) + " UTC" : "Time not recorded"}</time><strong>{event.label}</strong><span>{event.detail}</span></article>)}</div></section>
    <section className={styles.section}><h2>Stage evidence</h2>{(report.stages?.length ?? 0) === 0 ? <p className={styles.missing}>No stages recorded.</p> : <div className={styles.mediaGrid}>{report.stages!.map((stage, index) => { const imageHref = stage.image ? artifactUrl(slug, stage.image) : null; const logHref = stage.log ? artifactUrl(slug, stage.log) : null; return <figure key={index}>{imageHref && manifestPaths.has(stage.image!) ? <img src={imageHref} alt={stage.title} /> : <div className={styles.noImage}>Image not recorded</div>}<figcaption><strong>{stage.title}</strong><span>{stage.description}</span><small>{stage.provenance}</small>{logHref && manifestPaths.has(stage.log!) ? <a href={logHref}>Stage log</a> : stage.log ? <em className={styles.missing}>Missing log</em> : null}</figcaption></figure>; })}</div>}</section>
    <section className={styles.section}><h2>Recordings</h2>{recordings.length === 0 ? <p className={styles.missing}>No recording recorded.</p> : <div className={styles.mediaGrid}>{recordings.map((recording, index) => { const href = artifactUrl(slug, recording.path); return href && manifestPaths.has(recording.path) ? <figure key={index}><video controls preload="metadata"><source src={href} type="video/webm" /></video><figcaption><strong>{recording.label || recording.path}</strong><span>{recording.scope}</span></figcaption></figure> : <p className={styles.missing} key={index}>{recording.label || recording.path}: missing proof.</p>; })}</div>}</section>
    <section className={styles.section}><h2>Artifacts</h2>{files.length === 0 ? <p className={styles.missing}>No artifact inventory recorded.</p> : <ul className={styles.files}>{files.map((file, index) => {
      const filePath = typeof file.path === "string" ? file.path : "";
      const href = artifactUrl(slug, filePath);
      const label = typeof file.label === "string" ? file.label : filePath || `Artifact ${index + 1}`;
      return <li key={index}>{href && manifestPaths.has(filePath) ? <a href={href}>{label}</a> : <span className={styles.missing}>{label}: missing proof</span>}</li>;
    })}</ul>}</section>
    {report.agentCommentary && <section className={styles.commentary}><p className={styles.eyebrow}>AGENT COMMENTARY / NOT RECORDED FACT</p><h2>{report.agentCommentary.summary}</h2><p>By {report.agentCommentary.author} · {report.agentCommentary.createdAt}</p><ul>{report.agentCommentary.comments.map((comment, index) => <li key={index}><strong>{comment.section}</strong><span>{comment.text}</span></li>)}</ul></section>}
    <section className={styles.section}><h2>Raw records</h2><RecordDetails title="Run record" value={report.run} /><RecordDetails title="Recovery record" value={report.recovery} /></section>
  </main>;
}
