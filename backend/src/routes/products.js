const express = require('express');
const { getProducts } = require('../services/productService');

const router = express.Router();

/**
 * GET /products
 *
 * Query params:
 *   limit    {number}  Items per page. Default 20, max 100.
 *   cursor   {string}  Opaque pagination cursor from previous response.
 *   category {string}  Filter by product category (optional).
 *
 * Response:
 *   {
 *     products:    Product[],
 *     next_cursor: string | null,
 *     count:       number
 *   }
 */
router.get('/', async (req, res, next) => {
  try {
    // ── Validate and parse limit ─────────────────────────────────────────────
    let limit = parseInt(req.query.limit, 10);

    if (isNaN(limit) || limit < 1) limit = 20;   // default
    if (limit > 100) limit = 100;                 // cap — prevents clients from requesting huge pages

    // ── Extract other params ─────────────────────────────────────────────────
    const cursor = req.query.cursor || null;
    const category = req.query.category || null;

    // ── Validate category if provided ────────────────────────────────────────
    // We only allow alphanumeric + spaces + hyphens to prevent injection attempts.
    if (category && !/^[a-zA-Z0-9 _-]+$/.test(category)) {
      return res.status(400).json({ error: 'Invalid category format' });
    }

    const { products, nextCursor } = await getProducts({ category, cursor, limit });

    // Format price back to dollars for the response
    const formatted = products.map((p) => ({
      id: p._id,
      name: p.name,
      category: p.category,
      price: (p.price / 100).toFixed(2), // cents → dollars string e.g. "19.99"
      created_at: p.created_at,
      updated_at: p.updated_at,
    }));

    return res.json({
      products: formatted,
      next_cursor: nextCursor,
      count: formatted.length,
    });
  } catch (err) {
    next(err); // pass to global error handler
  }
});

module.exports = router;
