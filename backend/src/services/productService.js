const Product = require('../models/Product');

// ─── Cursor Helpers ───────────────────────────────────────────────────────────

/**
 * Encodes the last product in a page into an opaque cursor string.
 * We base64-encode so clients treat it as a black box, not a value to hack.
 *
 * The cursor encodes two fields:
 *   - created_at: the sort key (Date)
 *   - id:         the tiebreaker (MongoDB ObjectId string)
 *
 * WHY do we need both fields?
 * Multiple products can share the exact same created_at timestamp,
 * especially during bulk inserts. Without a tiebreaker, the cursor
 * would be ambiguous and we might skip or duplicate items.
 */
function encodeCursor(product) {
  const payload = {
    created_at: product.created_at.toISOString(),
    id: product._id.toString(),
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

/**
 * Decodes a cursor string back into { created_at, id }.
 * Returns null if the cursor is missing or malformed.
 */
function decodeCursor(cursorStr) {
  if (!cursorStr) return null;
  try {
    const json = Buffer.from(cursorStr, 'base64').toString('utf8');
    const parsed = JSON.parse(json);

    if (!parsed.created_at || !parsed.id) return null;

    return {
      created_at: new Date(parsed.created_at),
      id: parsed.id,
    };
  } catch {
    return null; // invalid cursor → treat as first page
  }
}

// ─── Core Query ──────────────────────────────────────────────────────────────

/**
 * Fetches one page of products using keyset (cursor) pagination.
 *
 * @param {object} options
 * @param {string|null} options.category  - filter by category (optional)
 * @param {string|null} options.cursor    - opaque cursor from previous page
 * @param {number}      options.limit     - page size (1–100)
 *
 * @returns {{ products: Product[], nextCursor: string|null }}
 */
async function getProducts({ category, cursor, limit }) {
  // ── Build the base filter ──────────────────────────────────────────────────
  const filter = {};

  if (category) {
    filter.category = category.toLowerCase();
  }

  // ── Apply cursor condition ─────────────────────────────────────────────────
  const decoded = decodeCursor(cursor);

  if (decoded) {
    /**
     * Keyset pagination condition — this is the heart of the algorithm.
     *
     * We want all products that come AFTER the cursor position in our sort order
     * (created_at DESC, _id DESC).
     *
     * A product is "after" the cursor if:
     *   - Its created_at is strictly older (less than cursor's created_at)
     *   OR
     *   - Its created_at is the same AND its _id is strictly less
     *     (MongoDB ObjectIds are sortable: lexicographically earlier = older)
     *
     * WHY OR and not AND?
     * We can't just do (created_at < T AND _id < X) because that would
     * exclude items with the same timestamp but a different _id.
     * The two-condition OR correctly handles the tiebreaker.
     *
     * WHY is this safe when new products are inserted?
     * New products get a newer created_at, so they appear before cursor.created_at
     * in our sort. They never pollute pages the user has already passed.
     */
    filter.$or = [
      { created_at: { $lt: decoded.created_at } },
      {
        created_at: decoded.created_at,
        _id: { $lt: decoded.id },
      },
    ];
  }

  // ── Run the query ─────────────────────────────────────────────────────────
  // We fetch limit + 1 to know whether a next page exists.
  // If we get back limit+1 results, there are more pages.
  // We only return `limit` results to the client.
  const products = await Product.find(filter)
    .sort({ created_at: -1, _id: -1 })
    .limit(limit + 1)
    .lean(); // .lean() returns plain JS objects instead of Mongoose docs — faster

  const hasMore = products.length > limit;
  const page = hasMore ? products.slice(0, limit) : products;

  // ── Build next cursor ─────────────────────────────────────────────────────
  // The cursor points at the LAST item we're returning, not the first of the next page.
  // This way the next request knows exactly where to continue from.
  const nextCursor = hasMore ? encodeCursor(page[page.length - 1]) : null;

  return { products: page, nextCursor };
}

module.exports = { getProducts };
