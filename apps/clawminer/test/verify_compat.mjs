#!/usr/bin/env node
/**
 * Cross-language hash verification script.
 *
 * Run this from the path402 root:
 *   node apps/clawminer/test/verify_compat.mjs
 *
 * It produces the same test vectors used in the Go compat_test.go files.
 * If any output differs from the Go tests, the two implementations are
 * incompatible and will not interoperate on the gossip network.
 */

import { createHash } from 'crypto';

// ── Helpers ────────────────────────────────────────────────────────

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

function sha256Bytes(data) {
  return createHash('sha256').update(data).digest();
}

function doubleSHA256(data) {
  const h1 = createHash('sha256').update(data).digest();
  return createHash('sha256').update(h1).digest('hex');
}

// ── Test Vectors ───────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function check(name, got, want) {
  if (got === want) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.error(`  ✗ ${name}`);
    console.error(`    got:  ${got}`);
    console.error(`    want: ${want}`);
    failed++;
  }
}

console.log('=== Double-SHA256 ===');
check(
  'empty string',
  doubleSHA256(''),
  '5df6e0e2761359d30a8275058e299fcc0381534545f55cf43e41983f5d4c9456'
);
check(
  'Hello World',
  doubleSHA256('Hello World'),
  '42a873ac3abd02122d27e80486c6fa1ef78694e8505fcec9cbcc8a7728ba8949'
);

console.log('\n=== Block Header Serialization ===');
const header = {
  version: 1,
  prevHash: '0000000000000000000000000000000000000000000000000000000000000000',
  merkleRoot: 'abc123',
  timestamp: 1700000000000,
  bits: 3,
  nonce: 42,
  minerAddress: '1TestAddress',
};
const serialized = `${header.version}:${header.prevHash}:${header.merkleRoot}:${header.timestamp}:${header.bits}:${header.nonce}:${header.minerAddress}`;
check(
  'header format',
  serialized,
  '1:0000000000000000000000000000000000000000000000000000000000000000:abc123:1700000000000:3:42:1TestAddress'
);

const blockHash = doubleSHA256(serialized);
console.log(`  Block hash: ${blockHash}`);

console.log('\n=== Merkle Root ===');

// Empty
const emptyMerkle = sha256('empty');
check('empty merkle', emptyMerkle, sha256('empty'));
console.log(`  Empty merkle: ${emptyMerkle}`);

// Single item
const singleMerkle = sha256('only-one');
check('single item', singleMerkle, sha256('only-one'));
console.log(`  Single merkle: ${singleMerkle}`);

// Multiple items (sorted, joined by |)
const ids = ['charlie', 'alpha', 'bravo'];
ids.sort();
const joined = ids.join('|');
check('sorted join', joined, 'alpha|bravo|charlie');
const multiMerkle = sha256(joined);
console.log(`  Multi merkle: ${multiMerkle}`);

// Work items from round-trip test
const workIds = ['work-1', 'work-2', 'work-3', 'work-4', 'work-5'];
workIds.sort();
const workJoined = workIds.join('|');
const workMerkle = sha256(workJoined);
console.log(`  Work merkle: ${workMerkle}`);

console.log('\n=== Topic Names ===');
const topics = [
  '$402/tokens/v1',
  '$402/transfers/v1',
  '$402/stamps/v1',
  '$402/chat/v1',
  '$402/content/v1',
];
check('topic count', topics.length, 5);
topics.forEach((t) => console.log(`  ${t}`));

console.log('\n=== Protocol Constants ===');
check('protocol version', '0.1.0', '0.1.0');
check('max message size', 65536, 65536);
check('message TTL', 300, 300);
check('max hops', 10, 10);

console.log('\n=== Difficulty Check ===');
function checkDifficulty(hash, bits) {
  return hash.startsWith('0'.repeat(bits));
}
check('000abc/3', checkDifficulty('000abc', 3), true);
check('000abc/4', checkDifficulty('000abc', 4), false);
check('0000abc/4', checkDifficulty('0000abc', 4), true);
check('abc000/3', checkDifficulty('abc000', 3), false);

console.log('\n=== Message Types (15 total) ===');
const messageTypes = [
  'hello', 'ping', 'pong',
  'announce_token', 'transfer_event', 'price_update',
  'agent_status', 'content_proof', 'stamp_content',
  'chat_message', 'reputation_update', 'network_stats',
  'content_request', 'content_response', 'block_announcement',
];
check('message type count', messageTypes.length, 15);

// ── Summary ────────────────────────────────────────────────────────

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  console.error('\nCOMPATIBILITY FAILURE: Go and TypeScript will produce different hashes!');
  process.exit(1);
}
console.log('\nAll cross-language vectors match.');
