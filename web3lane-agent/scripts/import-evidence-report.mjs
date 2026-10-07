import { cp, mkdir, mkdtemp, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyEvidenceBundle } from './evidence-bundle.mjs';

const defaultApp = fileURLToPath(new URL('../../web3lane-reports/', import.meta.url));

export async function importEvidenceReport(bundleDir, slug, appDir = defaultApp) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug ?? '') || slug.length > 100) throw new Error('Report slug must use lowercase letters, digits and hyphens');
  const { manifest } = await verifyEvidenceBundle(bundleDir);
  const reports = path.resolve(appDir, 'public/evidence');
  await mkdir(reports, { recursive: true });
  if ((await readdir(reports)).includes(slug)) throw new Error('Report already imported; use a new versioned slug');
  const temporary = await mkdtemp(path.join(reports, '.import-'));
  try {
    for (const name of ['manifest.json', ...manifest.files.map(file => file.path)]) {
      const target = path.join(temporary, name);
      await mkdir(path.dirname(target), { recursive: true });
      await cp(path.resolve(bundleDir, name), target, { dereference: false });
    }
    // Verify the copied bytes too, so changes during copying cannot slip into the app.
    await verifyEvidenceBundle(temporary);
    await rename(temporary, path.join(reports, slug));
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
  return { directory: path.join(reports, slug), route: `/reports/${slug}` };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [bundleDir, slug, appDir] = process.argv.slice(2);
  if (!bundleDir || !slug) throw new Error('Usage: node scripts/import-evidence-report.mjs <bundle-directory> <slug> [next-app-directory]');
  console.log(JSON.stringify(await importEvidenceReport(bundleDir, slug, appDir)));
}
