import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { assertExactApprovedPlan } from "./cypress-script.ts";
import type { ApprovedPlan } from "./types.ts";
import { serviceDataPath, writeJsonAtomic } from "../../service-storage.mjs";

const JOB_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

function storeRoot(): string {
  return process.env.WEB3LANE_APPROVED_PLAN_STORE
    ? process.env.WEB3LANE_APPROVED_PLAN_STORE
    : serviceDataPath("approved-plans");
}

function planPath(jobId: string): string {
  if (!JOB_ID.test(jobId)) throw new Error("Invalid approved plan job ID");
  return join(storeRoot(), `${jobId}.json`);
}

/** Host-side only. Do not expose this function as an Eve tool. */
export async function persistApprovedPlan(plan: ApprovedPlan): Promise<void> {
  const hash = plan.approval?.approved_plan_hash;
  if (!hash) throw new Error("Only an approved plan can be persisted");
  assertExactApprovedPlan(plan, hash, plan.plan_version);
  const path = planPath(plan.job_id);
  await writeJsonAtomic(path, plan);
}

/** Loads and revalidates the artifact persisted by the trusted host. */
export async function loadApprovedPlan(
  jobId: string,
  planVersion: number,
): Promise<ApprovedPlan> {
  const path = planPath(jobId);
  let plan: ApprovedPlan;
  try {
    plan = JSON.parse(await readFile(path, "utf8")) as ApprovedPlan;
  } catch {
    throw new Error(`No approved plan artifact found for job ${jobId}`);
  }
  if (plan.job_id !== jobId || plan.plan_version !== planVersion) {
    throw new Error("Stored approved plan job ID or version does not match the request");
  }
  const hash = plan.approval?.approved_plan_hash;
  if (!hash) throw new Error("Stored plan is not approved");
  assertExactApprovedPlan(plan, hash, planVersion);
  return plan;
}
