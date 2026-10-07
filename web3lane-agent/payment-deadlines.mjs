const minute = 60_000;

// Cardano preprod lock detection previously took about 14 minutes. Leave room
// for payment scanning, browser work, and result submission before each deadline.
export function paymentDeadlines(now = Date.now()) {
  return {
    payByTime: new Date(now + 45 * minute).toISOString(),
    submitResultTime: new Date(now + 135 * minute).toISOString(),
    unlockTime: new Date(now + 195 * minute).toISOString(),
    externalDisputeUnlockTime: new Date(now + 255 * minute).toISOString(),
  };
}
