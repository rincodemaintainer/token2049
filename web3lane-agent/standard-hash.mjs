import { createHash } from "node:crypto";
import { jcs } from "@x402/cardano";

export const sha256 = (value) => createHash("sha256").update(value, "utf8").digest("hex");
export const inputHash = (input, nonce) => sha256(`${nonce};${jcs(input)}`);
export const resultHash = (result, nonce) => sha256(`${nonce};${result}`);
