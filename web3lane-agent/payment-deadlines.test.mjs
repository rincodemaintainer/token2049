import assert from "node:assert/strict";
import { test } from "node:test";
import { paymentDeadlines } from "./payment-deadlines.mjs";

test("payment terms leave time for delayed escrow detection and QA", () => {
  const now = Date.UTC(2026, 9, 7);
  const terms = paymentDeadlines(now);
  assert.equal(Date.parse(terms.payByTime) - now, 45 * 60_000);
  assert.equal(Date.parse(terms.submitResultTime) - Date.parse(terms.payByTime), 90 * 60_000);
  assert.equal(Date.parse(terms.unlockTime) - Date.parse(terms.submitResultTime), 60 * 60_000);
  assert.equal(Date.parse(terms.externalDisputeUnlockTime) - Date.parse(terms.unlockTime), 60 * 60_000);
});
