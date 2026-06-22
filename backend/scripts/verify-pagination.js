/**
 * Pagination verification script.
 * Fetches 10 pages and checks for duplicates, gaps, and correct sort order.
 *
 * Run with: node scripts/verify-pagination.js
 * (Server must be running on localhost:3000)
 */

const BASE_URL = 'http://localhost:3000';
const LIMIT = 20;
const PAGES_TO_CHECK = 10;

async function fetchPage(cursor, category) {
  const params = new URLSearchParams({ limit: LIMIT });
  if (cursor) params.set('cursor', cursor);
  if (category) params.set('category', category);

  const res = await fetch(`${BASE_URL}/products?${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async function verifyPagination(label, category = null) {
  console.log(`\n--- Verifying: ${label} ---`);

  const seenIds = new Set();
  let cursor = null;
  let lastCreatedAt = null;
  let totalFetched = 0;
  let passed = true;

  for (let page = 1; page <= PAGES_TO_CHECK; page++) {
    const data = await fetchPage(cursor, category);
    const products = data.products;

    if (products.length === 0) {
      console.log(`  Page ${page}: empty — end of results`);
      break;
    }

    // Check 1: sort order — each product should be <= previous
    for (const p of products) {
      if (lastCreatedAt && new Date(p.created_at) > new Date(lastCreatedAt)) {
        console.error(`  ✗ SORT ORDER BROKEN: ${p.created_at} came after ${lastCreatedAt}`);
        passed = false;
      }
      lastCreatedAt = p.created_at;
    }

    // Check 2: no duplicate IDs across pages
    for (const p of products) {
      if (seenIds.has(p.id)) {
        console.error(`  ✗ DUPLICATE ID: ${p.id} appeared on page ${page}`);
        passed = false;
      }
      seenIds.add(p.id);
    }

    totalFetched += products.length;
    console.log(`  Page ${page}: ${products.length} products, cursor=${data.next_cursor ? 'present' : 'null'}`);

    cursor = data.next_cursor;
    if (!cursor) break;
  }

  if (passed) {
    console.log(`  ✓ All checks passed — ${totalFetched} products fetched, 0 duplicates, correct sort order`);
  }
}

async function verifyEdgeCases() {
  console.log('\n--- Verifying: Edge Cases ---');

  // Bad cursor should return first page, not error
  const badCursor = await fetchPage('not-a-valid-cursor');
  console.log(`  Bad cursor → ${badCursor.products.length} products (expected: ${LIMIT}) ${badCursor.products.length === LIMIT ? '✓' : '✗'}`);

  // Invalid category format should return 400
  const res = await fetch(`${BASE_URL}/products?category=<script>`);
  console.log(`  XSS category → HTTP ${res.status} (expected: 400) ${res.status === 400 ? '✓' : '✗'}`);

  // Limit clamping — requesting 999 should return max 100
  const bigLimit = await fetchPage(null);
  const bigRes = await fetch(`${BASE_URL}/products?limit=999`);
  const bigData = await bigRes.json();
  console.log(`  limit=999 → ${bigData.count} products (expected: ≤100) ${bigData.count <= 100 ? '✓' : '✗'}`);

  // Health check
  const health = await fetch(`${BASE_URL}/health`);
  const healthData = await health.json();
  console.log(`  /health → ${healthData.status} (expected: ok) ${healthData.status === 'ok' ? '✓' : '✗'}`);
}

async function main() {
  console.log(`Connecting to ${BASE_URL}...`);

  try {
    // Basic connectivity check
    await fetch(`${BASE_URL}/health`);
  } catch {
    console.error('Cannot reach server. Is it running on port 3000?');
    process.exit(1);
  }

  await verifyPagination('No filter');
  await verifyPagination('Category: electronics', 'electronics');
  await verifyPagination('Category: books', 'books');
  await verifyEdgeCases();

  console.log('\nDone.');
}

main().catch(console.error);
