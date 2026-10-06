import { createHash } from "node:crypto";

export const sha256 = (value) => createHash("sha256").update(value, "utf8").digest("hex");
export const inputHash = (input, nonce) => sha256(`${nonce};${JSON.stringify({ prompt: input.prompt })}`);
export const resultHash = (result, nonce) => sha256(`${nonce};${result}`);
