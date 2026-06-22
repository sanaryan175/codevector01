const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      trim: true,
      lowercase: true, // normalize so "Electronics" and "electronics" are the same
    },
    // Price stored in cents (integer) to avoid floating-point precision issues.
    // e.g. $19.99 is stored as 1999
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: [0, 'Price cannot be negative'],
    },
  },
  {
    // Mongoose adds createdAt and updatedAt automatically when timestamps: true
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// ─── Indexes ─────────────────────────────────────────────────────────────────

// Index 1: Global newest-first browsing (no category filter).
// Covers: GET /products?limit=20
productSchema.index({ created_at: -1, _id: -1 });

// Index 2: Category filter + newest-first sort.
// Covers: GET /products?category=electronics&limit=20
//
// WHY compound and not two separate indexes?
// MongoDB can only use one index per query. If we had { category: 1 } and
// { created_at: -1 } separately, MongoDB would use one and then do an
// in-memory sort for the other — slow on 200k docs.
//
// With this compound index, MongoDB does a single index scan on a specific
// category "bucket", already in created_at DESC order. No in-memory sort.
productSchema.index({ category: 1, created_at: -1, _id: -1 });

const Product = mongoose.model('Product', productSchema);

module.exports = Product;
