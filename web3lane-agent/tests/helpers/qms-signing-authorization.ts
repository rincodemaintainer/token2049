export type QmsSigningAuthorization = Readonly<{
  granted: true;
  chain_id: 19480;
  domain: "testnet.qwap.xyz";
  recipient: string;
  value: "10000000000000000";
  gas_cap_units: string;
  calldata: string;
  minimum_output_units: string;
}>;

/**
 * The popup may be confirmed only after the headed runner decoded its exact
 * request. Calling this without that record remains a hard stop.
 */
export async function requireQmsSigningAuthorization(
  authorization?: QmsSigningAuthorization,
): Promise<void> {
  if (!authorization || authorization.granted !== true || authorization.chain_id !== 19480 ||
      authorization.domain !== "testnet.qwap.xyz" ||
      authorization.recipient.toLowerCase() !== "0x93aff45f28e5df1b55f5aefefb807de843b12619" ||
      authorization.value !== "10000000000000000" ||
      !/^\d+$/.test(authorization.gas_cap_units) ||
      BigInt(authorization.gas_cap_units) > 10_000_000_000_000_000n ||
      !authorization.calldata.startsWith("0x7ff36ab5") ||
      BigInt(authorization.minimum_output_units) < 8000n) {
    throw new Error("Signing blocked: trusted approved-plan/escrow wallet adapter is not configured");
  }
}
