import type { ChainPerformanceObservation } from "./types.ts";

type FetchLike = typeof fetch;

/** Probe the target RPC before planning; it never sends a transaction. */
export async function probeTargetChainPerformance(input: {
  rpc_url: string;
  chain: string;
  chain_id: number;
  sample_size?: number;
  confirmations_required?: number;
  buyer_confirmed_confirmation_wait_seconds?: number;
  wallet_interaction_buffer_seconds: number;
  fetcher?: FetchLike;
  now?: () => Date;
}): Promise<ChainPerformanceObservation> {
  const fetcher = input.fetcher ?? fetch;
  const started = performance.now();
  const chainIdResponse = await rpc(fetcher, input.rpc_url, "eth_chainId", []);
  const latency = Math.round(performance.now() - started);
  const observedChainId = Number.parseInt(chainIdResponse, 16);
  if (observedChainId !== input.chain_id) {
    throw new Error(`Target RPC chain ID ${observedChainId} does not match ${input.chain_id}`);
  }
  const latest = Number.parseInt(await rpc(fetcher, input.rpc_url, "eth_blockNumber", []), 16);
  const sampleSize = input.sample_size ?? 12;
  const blockNumbers = Array.from({ length: sampleSize }, (_, index) => latest - index)
    .filter((blockNumber) => blockNumber >= 0);
  const timestamps = await Promise.all(blockNumbers.map(async (blockNumber) => {
    const block = await rpc(fetcher, input.rpc_url, "eth_getBlockByNumber", [toHex(blockNumber), false]);
    const parsed = JSON.parse(block) as { timestamp?: string };
    if (!parsed.timestamp) throw new Error(`Target RPC probe returned no timestamp for block ${blockNumber}`);
    return Number.parseInt(parsed.timestamp, 16);
  }));
  const intervalP95 = percentile95(
    timestamps.sort((a, b) => a - b).slice(1).map((timestamp, index) => timestamp - timestamps[index]),
  );
  if (intervalP95 <= 0) throw new Error("Target RPC probe could not derive positive block intervals");
  const derivedConfirmationWait = Math.max(
    180,
    intervalP95 * (input.confirmations_required ?? 2) + 60,
  );
  const buyerOverride = input.buyer_confirmed_confirmation_wait_seconds;
  return {
    chain: input.chain,
    chain_id: input.chain_id,
    observed_at: (input.now ?? (() => new Date()))().toISOString(),
    source: "rpc-probe",
    rpc_latency_ms: latency,
    confirmation_wait_seconds: buyerOverride ?? derivedConfirmationWait,
    wallet_interaction_buffer_seconds: input.wallet_interaction_buffer_seconds,
    sampled_block_count: timestamps.length,
    block_interval_p95_seconds: intervalP95,
    confirmation_wait_source: buyerOverride ? "buyer-confirmed" : "observed-block-p95",
    note: buyerOverride
      ? `Buyer-confirmed ${buyerOverride}s confirmation wait overrides ${derivedConfirmationWait}s block-timing estimate.`
      : `Estimated from p95 ${intervalP95}s interval across ${timestamps.length} recent blocks; keep the wallet buffer.`,
  };
}

async function rpc(fetcher: FetchLike, url: string, method: string, params: unknown[]): Promise<string> {
  const response = await fetcher(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!response.ok) throw new Error(`Target RPC probe failed with HTTP ${response.status}`);
  const payload = await response.json() as { result?: unknown; error?: { message?: string } };
  if (payload.error || payload.result == null) {
    throw new Error(`Target RPC probe failed: ${payload.error?.message ?? "missing result"}`);
  }
  return typeof payload.result === "string" ? payload.result : JSON.stringify(payload.result);
}

function toHex(value: number): string {
  return `0x${value.toString(16)}`;
}

function percentile95(values: number[]): number {
  if (!values.length) throw new Error("Target RPC probe requires at least two blocks");
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * 0.95) - 1];
}
