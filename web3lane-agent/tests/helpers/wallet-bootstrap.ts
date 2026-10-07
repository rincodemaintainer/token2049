import { mnemonicToAccount } from "viem/accounts";

process.loadEnvFile(".env");
const password = process.env.QMS_TEST_WALLET_PASSWORD;
const mnemonic = process.env.QMS_TEST_WALLET_MNEMONIC;
const expectedAddress = process.env.QMS_TEST_WALLET_ADDRESS;
if (!password || !mnemonic || !expectedAddress) {
  throw new Error("Saved QMS test wallet configuration is incomplete");
}
if (mnemonicToAccount(mnemonic).address.toLowerCase() !== expectedAddress.toLowerCase()) {
  throw new Error("Saved recovery phrase does not match the test wallet address");
}

export const testWallet = { password, mnemonic, expectedAddress };
