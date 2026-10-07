import { Address } from '@evolution-sdk/evolution';

const mnemonic = process.env.ETERNL_PREPROD_MNEMONIC;
const projectId = process.env.BLOCKFROST_API_KEY_PREPROD;
if (!mnemonic || !projectId) throw new Error('Preprod mnemonic or Blockfrost key is missing');

const address = Address.toBech32(Address.fromSeed(mnemonic, { networkId: 0, addressType: 'Base' }));
if (address !== process.env.ETERNL_PREPROD_ADDRESS) throw new Error('Stored Preprod address does not match the mnemonic');

const response = await fetch(`https://cardano-preprod.blockfrost.io/api/v0/addresses/${address}`, {
  headers: { project_id: projectId },
});
let lovelace;
if (response.status === 404) {
  lovelace = 0n;
} else if (response.ok) {
  const account = await response.json();
  lovelace = BigInt(account.amount.find(asset => asset.unit === 'lovelace')?.quantity ?? '0');
} else {
  throw new Error(`Blockfrost balance request failed: HTTP ${response.status}`);
}

console.log(JSON.stringify({ wallet: 'Evolution SDK', network: 'Cardano Preprod', address, lovelace: lovelace.toString(), tADA: Number(lovelace) / 1_000_000 }));
