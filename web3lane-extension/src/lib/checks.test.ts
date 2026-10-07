import assert from "node:assert/strict";
import test from "node:test";
import { runChecks } from "./checks.ts";
import type { WalletSnapshot } from "./wallet.ts";

const snapshot = (overrides: Partial<WalletSnapshot> = {}): WalletSnapshot => ({ walletId: "lace", walletName: "Lace", networkId: 0, networkMagic: 1, signingAddress: "01deadbeef", balanceLovelace: "0", rewardAddresses: [], utxoCount: null, origin: "https://example.test", observedAt: "2026-10-07T00:00:00.000Z", ...overrides });
const status = (value: WalletSnapshot, id: string) => runChecks(value).find((check) => check.id === id)?.status;

test("Preprod passes", () => assert.equal(status(snapshot(), "network"), "pass"));
test("Preview is blocked", () => assert.equal(status(snapshot({ networkMagic: 2 }), "network"), "fail"));
test("missing CIP-142 fails closed", () => assert.equal(status(snapshot({ networkMagic: null }), "network"), "fail"));
test("missing signing address fails", () => assert.equal(status(snapshot({ signingAddress: "" }), "signing-address"), "fail"));
test("non-web origin fails", () => assert.equal(status(snapshot({ origin: "chrome://extensions" }), "origin"), "fail"));
