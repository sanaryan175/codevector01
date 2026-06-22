# Products API

A backend API for browsing ~200,000 products with fast, consistent pagination.

---

## Tech Stack

| Layer    | Choice              | Reason |
|----------|---------------------|--------|
| Runtime  | Node.js 20          | Non-blocking I/O fits well for many concurrent read requests |
| Framework| Express             | Minimal, widely understood, no magic |
| Database | MongoDB (Atlas)     | MERN stack requirement; compound indexes suit this query pattern |
| ODM      | Mongoose            | Schema validation + index management in one place |
| Hosting  | Render (API) + MongoDB Atlas (DB) | Render has a genuinely free tier (no credit card); Atlas free tier is 512MB |

---

## Why Cursor Pagination Instead of Offset

**Offset pagination problem:**

```
Page 1:  SKIP 0   LIMIT 20  → returns items 1–20
[new product inserted]
Page 2:  SKIP 20  LIMIT 20  → returns items 22–41  ← item 21 silently skipped
```

MongoDB implements `skip()` by scanning and discarding documents.
At `SKIP 100000`, it reads and throws away 100,000 docs before returning your 20.
This gets linearly slower as users page deeper.

**Cursor pagination solution:**

Instead of "give me page 5", we say "give me everything after this specific item."

```
Page 1: no cursor → returns products, last item has created_at=T, id=X
Page 2: cursor encodes (T, X) → query: (created_at < T) OR (created_at = T AND id < X)
```

- MongoDB uses the index directly — no scanning discarded rows
- New inserts at the top never affect pages already fetched
- Consistent O(log n) performance regardless of how deep you page

---

## Database Indexing

Two compound indexes are defined in `src/models/Product.js`:

### Index 1 — No category filter
```js
{ created_at: -1, _id: -1 }
```
Covers `GET /products?limit=20` — newest first, no filter.

### Index 2 — Category filter
```js
{ category: 1, created_at: -1, _id: -1 }
```
Covers `GET /products?category=electronics&limit=20`.

**Why compound instead of separate indexes?**
MongoDB uses one index per query. A query that filters by `category` AND sorts by `created_at` needs a single index that covers both fields. This index lets MongoDB jump directly to the "electronics" bucket and read it in sorted order — no in-memory sort, no second index scan.

**Why `_id` as the last field?**
Two products can have identical `created_at` timestamps (especially during bulk seed). Without a tiebreaker, the cursor would be ambiguous. `_id` is a MongoDB ObjectId — globally unique and monotonically increasing within the same second — making it a perfect stable tiebreaker.

---

## Price Storage

Prices are stored as integers in **cents** (e.g., `$19.99` → `1999`).

IEEE 754 floats cannot represent most decimal fractions exactly.
`0.1 + 0.2 === 0.30000000000000004` in JavaScript.
Storing cents as integers avoids any rounding bugs in price comparisons or calculations.
The API response converts back to dollars: `(price / 100).toFixed(2)`.

---

## Project Structure

```
backend/
├── src/
│   ├── config/
│   │   └── database.js       # MongoDB connection logic
│   ├── models/
│   │   └── Product.js        # Schema definition + indexes
│   ├── routes/
│   │   └── products.js       # Route handler, input validation
│   ├── services/
│   │   └── productService.js # Cursor encode/decode, query logic
│   ├── middleware/
│   │   └── errorHandler.js   # Global error handler
│   └── app.js                # Express app + server startup
├── scripts/
│   └── seed.js               # Bulk insert 200k products
├── .env.example
├── package.json
├── Dockerfile
└── README.md
```

---

## Running Locally

### Prerequisites
- Node.js 20+
- MongoDB running locally, or a MongoDB Atlas connection string

### Steps

```bash
# 1. Install dependencies
cd backend
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env and set MONGODB_URI

# 3. Seed the database (takes ~15–30 seconds)
npm run seed

# 4. Start the server
npm start
# or for development with auto-reload:
npm run dev
```

---

## API Reference

### `GET /products`

Returns a paginated list of products, newest first.

**Query Parameters**

| Param      | Type   | Default | Description |
|------------|--------|---------|-------------|
| `limit`    | number | 20      | Items per page (max 100) |
| `cursor`   | string | —       | Cursor from previous response |
| `category` | string | —       | Filter by category |

**First Request**
```
GET /products?limit=20
GET /products?limit=20&category=electronics
```

**Response**
```json
{
  "products": [
    {
      "id": "665f1a2b3c4d5e6f7a8b9c0d",
      "name": "Premium Widget 4821",
      "category": "electronics",
      "price": "49.99",
      "created_at": "2024-06-01T14:32:00.000Z",
      "updated_at": "2024-06-01T14:32:00.000Z"
    }
  ],
  "next_cursor": "eyJjcmVhdGVkX2F0IjoiMjAyNC0wNi0wMVQxNDozMjowMC4wMDBaIiwiaWQiOiI2NjVmMWEyYjNjNGQ1ZTZmN2E4YjljMGQifQ==",
  "count": 20
}
```

**Next Page**
```
GET /products?limit=20&cursor=eyJjcmVhdGVkX2F0Ijo...
```

When `next_cursor` is `null`, you have reached the last page.

### `GET /health`
Returns `{ "status": "ok" }` — used by deployment platforms for health checks.

---

## Seed Script Details

```bash
npm run seed
```

- Deletes all existing products
- Inserts 200,000 products in batches of 1,000
- Uses `insertMany` with `ordered: false` for maximum throughput
- Products have randomized names, categories, prices, and timestamps spread over 2 years
- Takes ~15–30 seconds on a local machine

**Why batches of 1,000?**
One insert per document = 200,000 network round trips.
Batches of 1,000 = 200 round trips. Approximately 1,000× faster.
We cap at 1,000 per batch to stay well under MongoDB's 16MB BSON operation limit.

---

## Deployment (Render + MongoDB Atlas)

### Step 1 — MongoDB Atlas (free tier)
1. Create account at [mongodb.com/atlas](https://www.mongodb.com/atlas)
2. Create a free M0 cluster (512MB, sufficient for this project)
3. Create a database user under **Database Access**
4. Under **Network Access** → Add IP Address → **Allow Access from Anywhere** (`0.0.0.0/0`)
   - This is required because Render free tier uses dynamic IPs
5. Copy the connection string: `mongodb+srv://user:pass@cluster.mongodb.net/productsdb`

### Step 2 — Seed the database
Run this once from your local machine, pointing at Atlas:
```bash
# Make sure your .env has the Atlas MONGODB_URI, then:
cd backend
npm run seed
```
The seed runs locally but inserts into your remote Atlas cluster.

### Step 3 — Push code to GitHub
```bash
cd ..  # project root
git add .
git commit -m "initial commit"
git branch -M main
git push -u origin main
```
Verify on GitHub that `.env` is **not** committed — only `.env.example` should be there.

### Step 4 — Deploy on Render (free tier)
1. Create account at [render.com](https://render.com) — sign up with GitHub
2. Dashboard → **New → Web Service**
3. Select your GitHub repo
4. Configure:

| Field | Value |
|---|---|
| **Root Directory** | `backend` |
| **Runtime** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `node src/app.js` |
| **Instance Type** | `Free` |

5. Scroll to **Environment Variables** and add:

| Key | Value |
|---|---|
| `MONGODB_URI` | `mongodb+srv://user:pass@cluster.mongodb.net/productsdb` |
| `NODE_ENV` | `production` |
| `PORT` | `3000` |

6. Click **Create Web Service** — Render builds and deploys automatically

A successful deploy log ends with:
```
MongoDB connected: ac-xxx.mongodb.net
Server running on port 3000
==> Your service is live 🎉
```

Your live URL will be: `https://your-service-name.onrender.com`

### Step 5 — Verify live API
```
GET https://your-service-name.onrender.com/health
GET https://your-service-name.onrender.com/products?limit=5
GET https://your-service-name.onrender.com/products?limit=5&category=electronics
```

### Note on Render free tier cold starts
Free services spin down after 15 minutes of inactivity. The first request after that takes ~30 seconds to wake up. Open the URL yourself before any demo to warm it up — subsequent requests will be fast.

To keep it warm automatically, set up a free monitor at [uptimerobot.com](https://uptimerobot.com) to ping `/health` every 14 minutes.

---

## What I Would Improve With More Time

1. **Total count endpoint** — cursor pagination intentionally doesn't return a total count (it would require a full collection scan). A separate `GET /products/count` endpoint with caching could provide this.

2. **Cursor expiry** — cursors currently never expire. In production I'd add a timestamp to the cursor and reject stale ones (e.g., older than 24 hours) to prevent abuse.

3. **Rate limiting** — add `express-rate-limit` to prevent scraping of all 200k products.

4. **Search** — full-text search on product names via MongoDB Atlas Search (Lucene-based).

5. **Caching** — first page results (`no cursor`) are identical for all users. A Redis cache with a short TTL (30s) would eliminate most DB load.

6. **Tests** — integration tests covering: first page, subsequent pages, category filtering, invalid cursor handling, boundary conditions.

---

## How AI Helped and What I Verified

AI (Kiro) generated the initial structure, cursor encoding logic, and index definitions.

**What I verified and understood:**

- The `$or` condition in the keyset query — I traced through it manually with sample data to confirm it handles the tiebreaker case correctly
- Index field order — confirmed that `{ category, created_at, _id }` vs `{ created_at, category, _id }` produces different query plans; order matters
- The `lean()` call in the query — confirmed it returns plain JS objects and is meaningfully faster for read-only queries
- `ordered: false` in `insertMany` — confirmed it means MongoDB doesn't stop on a validation error, it skips and continues; appropriate here because seed data is synthetic
- Price in cents — verified that JavaScript float arithmetic is lossy and that integer cent storage is the correct approach for financial data
