/**
 * Fixed-fee quote with contingency buffer.
 * Unused contingency does not reduce the published fee.
 */

export type QuoteInput = {
  base_fee_units: string;
  contingency_percent?: number;
  network?: string;
  asset?: string;
  decimals?: number;
};

export type Quote = {
  network: string;
  asset: string;
  decimals: number;
  base_fee_units: string;
  contingency_percent: number;
  contingency_units: string;
  fixed_total_units: string;
};

export function buildFixedQuote(input: QuoteInput): Quote {
  const contingency_percent = input.contingency_percent ?? 25;
  if (!Number.isSafeInteger(contingency_percent) || contingency_percent < 0) {
    throw new Error("contingency_percent must be a nonnegative integer");
  }
  if (!/^\d+$/.test(input.base_fee_units)) {
    throw new Error("base_fee_units must be a nonnegative integer string");
  }
  const base = BigInt(input.base_fee_units);
  const contingency =
    (base * BigInt(contingency_percent) + 99n) / 100n; // ceil
  const total = base + contingency;
  return {
    network: input.network ?? "Cardano preprod",
    asset: input.asset ?? "tADA",
    decimals: input.decimals ?? 6,
    base_fee_units: base.toString(),
    contingency_percent,
    contingency_units: contingency.toString(),
    fixed_total_units: total.toString(),
  };
}
