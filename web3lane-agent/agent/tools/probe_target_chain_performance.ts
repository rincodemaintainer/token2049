import { defineTool } from "eve/tools";
import { z } from "zod";
import { probeTargetChainPerformance } from "../lib/chain-performance.ts";

export default defineTool({
  description:
    "Probe an EVM target-chain RPC before plan approval. It reads eth_chainId, latest block, and bounded recent block timestamps to estimate a conservative confirmation wait. A buyer-confirmed wait may override the estimate. It never opens a wallet or sends a transaction.",
  inputSchema: z.object({
    rpc_url: z.string().url(),
    chain: z.string().min(1),
    chain_id: z.number().int().positive(),
    sample_size: z.number().int().min(3).max(30).default(12),
    confirmations_required: z.number().int().positive().default(2),
    buyer_confirmed_confirmation_wait_seconds: z.number().int().positive().optional(),
    wallet_interaction_buffer_seconds: z.number().int().nonnegative().default(120),
  }),
  async execute(input) {
    return { target_chain_performance: await probeTargetChainPerformance(input) };
  },
});
