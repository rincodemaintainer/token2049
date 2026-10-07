import { readFileSync } from 'node:fs';
import { createHash, timingSafeEqual } from 'node:crypto';

// The operator provisions buyer identities and token hashes outside the agent.
// Approval requester_id must match this identity before checkout is allowed.
export function loadApiClients(file) {
  const clients = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(clients) || !clients.length || clients.some(client =>
    typeof client.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(client.id) ||
    !/^[a-f0-9]{64}$/.test(client.token_sha256 ?? '')) ||
    new Set(clients.map(client => client.id)).size !== clients.length ||
    new Set(clients.map(client => client.token_sha256)).size !== clients.length) {
    throw new Error('API clients must have unique IDs and SHA-256 token hashes');
  }
  return {
    authenticate(header) {
      if (typeof header !== 'string' || !/^Bearer [^\s]{32,512}$/.test(header)) return null;
      const hash = createHash('sha256').update(header.slice(7)).digest();
      return clients.find(client => timingSafeEqual(hash, Buffer.from(client.token_sha256, 'hex'))) ?? null;
    },
  };
}
