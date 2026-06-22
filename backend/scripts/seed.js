/**
 * Seed script: inserts 200,000 products into MongoDB.
 *
 * Run with: npm run seed
 *
 * WHY batch inserts?
 * Inserting one document at a time = 200,000 network round trips.
 * With insertMany in batches of 1,000 = only 200 round trips.
 * On a typical network this is the difference between ~5 minutes and ~10 seconds.
 *
 * WHY not one giant insertMany(all200k)?
 * MongoDB has a 16MB BSON document limit per operation.
 * A batch of 200k documents could easily exceed that.
 * 1,000 per batch is a safe, well-tested sweet spot.
 */

require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../src/config/database');
const Product = require('../src/models/Product');

// ─── Config ───────────────────────────────────────────────────────────────────

const TOTAL_PRODUCTS = 200_000;
const BATCH_SIZE = 1_000;

const CATEGORIES = [
  'electronics',
  'books',
  'clothing',
  'home & garden',
  'sports',
  'toys',
  'beauty',
  'automotive',
  'food & grocery',
  'office supplies',
];

const ADJECTIVES = [
  'Premium', 'Deluxe', 'Professional', 'Essential', 'Advanced',
  'Classic', 'Ultra', 'Smart', 'Portable', 'Compact',
  'Heavy-duty', 'Lightweight', 'Eco-friendly', 'Wireless', 'Digital',
];

const NOUNS = [
  'Widget', 'Gadget', 'Tool', 'Device', 'Kit',
  'Set', 'Pack', 'Bundle', 'System', 'Module',
  'Accessory', 'Component', 'Unit', 'Adapter', 'Monitor',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generate a random date spread over the last 2 years.
 * Spreading timestamps ensures created_at has good distribution,
 * which makes cursor pagination realistic and avoids timestamp collisions.
 */
function randomDate() {
  const now = Date.now();
  const twoYearsMs = 2 * 365 * 24 * 60 * 60 * 1000;
  return new Date(now - Math.random() * twoYearsMs);
}

/**
 * Build a batch of `size` product documents.
 * Returns plain objects — Mongoose will validate on insert.
 */
function buildBatch(size) {
  const batch = [];
  for (let i = 0; i < size; i++) {
    const name = `${randomItem(ADJECTIVES)} ${randomItem(NOUNS)} ${randomInt(100, 9999)}`;
    const createdAt = randomDate();

    batch.push({
      name,
      category: randomItem(CATEGORIES),
      price: randomInt(99, 99999), // 99 cents to $999.99 in cents
      created_at: createdAt,
      updated_at: createdAt,
    });
  }
  return batch;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function seed() {
  await connectDB();

  // Clear existing data so re-running the seed starts fresh
  console.log('Clearing existing products...');
  await Product.deleteMany({});

  console.log(`Seeding ${TOTAL_PRODUCTS.toLocaleString()} products in batches of ${BATCH_SIZE}...`);

  const totalBatches = Math.ceil(TOTAL_PRODUCTS / BATCH_SIZE);
  let inserted = 0;

  for (let batch = 0; batch < totalBatches; batch++) {
    const size = Math.min(BATCH_SIZE, TOTAL_PRODUCTS - inserted);
    const docs = buildBatch(size);

    // ordered: false means if one doc fails validation, the rest still insert.
    // This speeds up bulk inserts since MongoDB doesn't need to serialize writes.
    await Product.insertMany(docs, { ordered: false });

    inserted += size;

    // Progress log every 10 batches
    if ((batch + 1) % 10 === 0 || batch + 1 === totalBatches) {
      const pct = ((inserted / TOTAL_PRODUCTS) * 100).toFixed(1);
      console.log(`  ${inserted.toLocaleString()} / ${TOTAL_PRODUCTS.toLocaleString()} (${pct}%)`);
    }
  }

  console.log('Seed complete.');
  console.log(`Total documents in collection: ${await Product.countDocuments()}`);

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
