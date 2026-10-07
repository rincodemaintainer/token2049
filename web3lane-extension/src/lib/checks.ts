import type { WalletSnapshot } from "./wallet";

export type CheckResult = { id: string; title: string; status: "pass" | "fail" | "warn"; detail: string };

export function runChecks(snapshot: WalletSnapshot): CheckResult[] {
  const isPreprod = snapshot.networkId === 0 && snapshot.networkMagic === 1;
  return [
    { id: "network", title: "Preprod network", status: isPreprod ? "pass" : "fail", detail: isPreprod ? "Wallet confirms Cardano Preprod (network ID 0, magic 1)." : snapshot.networkMagic === null ? "This wallet cannot confirm Preprod (CIP-142). Use a wallet supporting network detection." : `Expected network ID 0 and magic 1; received ID ${snapshot.networkId}, magic ${snapshot.networkMagic}.` },
    { id: "signing-address", title: "Signing address", status: snapshot.signingAddress ? "pass" : "fail", detail: snapshot.signingAddress ? "Wallet returned a change address in raw hex." : "Wallet did not return a change address." },
    { id: "origin", title: "Website origin", status: /^https?:\/\//.test(snapshot.origin) ? "pass" : "fail", detail: /^https?:\/\//.test(snapshot.origin) ? `Bound to ${snapshot.origin}.` : "Wallet signing requires an http(s) website origin." },
  ];
}
