import Link from "next/link";
import { listReportSlugs, readReportBundle } from "../../lib/report-data";
import styles from "./reports.module.css";

export const dynamic = "force-static";

export default async function ReportsIndex() {
  const bundles = await Promise.all((await listReportSlugs()).map(readReportBundle));
  const reports = bundles.filter((bundle): bundle is NonNullable<typeof bundle> => bundle !== null);
  return <main className={styles.page}>
    <header className={styles.header}><p className={styles.eyebrow}>WEB3LANE / EVIDENCE ARCHIVE</p><h1>Recorded reports</h1><p>Static records packed from verified evidence bundles at build time.</p></header>
    {reports.length === 0 ? <section className={styles.empty}><h2>No reports imported</h2><p>Import a verified bundle into <code>public/reports/&lt;slug&gt;</code>, then rebuild this site.</p></section> :
      <ol className={styles.reportList}>{reports.map(({ slug, report }) => <li key={slug}><Link href={`/reports/${slug}`}><span>{report.title || slug}</span><small>{report.generatedAt || "Date not recorded"}</small></Link></li>)}</ol>}
  </main>;
}
