# Local model smoke tests

Tested with eve 0.71.2 and `chatgpt("gpt-5.6-luna")` on 6 October 2026. These prompts are synthetic. They show model execution, not wallet or Coworker execution.

## Plan

Input:

> A Web3 team asks: test a Base Sepolia swap from Token A to Token B and confirm the success notification. State a brief QA check and the one key detail still needed. Do not claim you ran it.

Output:

> QA check: On Base Sepolia, swap Token A for Token B within the approved spending limit, then verify the success notification and capture the wallet confirmation and transaction hash as evidence.  
> Key detail needed: the app URL and exact Token A/Token B contract addresses (plus the wallet and spending limit if not already specified).

## Report supplied evidence

Input:

> Report this synthetic observation only: an approved Base Sepolia swap showed a confirmed transaction hash 0xabc123 in a supplied explorer screenshot, the app balance changed from 10 A to 9 A and 0 B to 1 B, but no success notification appeared within 30 seconds. No recording or raw chain receipt was supplied. State finding, evidence, and limits briefly.

Output:

> **Finding:** The swap appears to have completed, but the success notification was not observed within 30 seconds.
>
> **Evidence:** Supplied explorer screenshot shows confirmed transaction hash `0xabc123`; the app balance changed from `10 A` to `9 A` and from `0 B` to `1 B`.
>
> **Limits:** No recording or raw on-chain receipt was supplied, so notification timing and transaction details beyond the screenshot could not be independently verified.
