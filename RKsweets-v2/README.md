# RK Sweet Shop V2

Fresh V2 workspace. The legacy project remains in its parent directory. The logo was copied from the existing `assets/images/rk-sweet-shop-logo.png` without altering it.

## Applications

- `customer/`: React/Vite customer portal (`http://localhost:5173`)
- `admin/`: React/Vite admin portal (`http://localhost:5174`)
- `server/`: Express/Mongoose API (`http://localhost:3003`)

## Setup

1. Install Node.js 20 or newer and MongoDB Atlas. Create a dedicated database user with access only to the V2 database, add the development machine's IP to Atlas Network Access, and copy the connection string.
2. Copy the root `.env.example` to `server/.env`; set `MONGODB_URI` and two distinct random secrets (at least 32 random bytes each). Set Cloudinary values for image features. Never commit `.env`.
3. Run `npm install` once in this directory. The root lockfile covers all three application workspaces.
4. Bootstrap the first owner account with `npm run setup:admin` from `server` after configuring `.env`; the command prompts for the business identity and a password.
5. Start all development processes with `npm run dev`, or use `npm run dev:server`, `npm run dev:customer`, and `npm run dev:admin` in separate terminals.

Production frontend origins must be listed explicitly in `CLIENT_ORIGINS`. Set `COOKIE_SECURE=true` behind HTTPS. For portals on different sites set `COOKIE_SAME_SITE=none` with secure cookies and review CSRF/origin policy. Use distinct admin/customer hostnames if desired; configure each Vite app's `VITE_API_URL` at build time. Atlas transactions require a replica set, as provided by Atlas.

## Implemented API surface

Customer routes include registration/login/logout/session, profile updates, active categories/products/featured products, authenticated order submission, own order list/detail and receipt retrieval. Admin routes include login/logout/session, settings, product CRUD and Cloudinary image management, category activation, table management and QR token rotation, order queue and lifecycle operations, counter payment and receipts, audit listing, and business-day close/report finalization. All responses use `{data}` or `{error:{code,message}}`. Auth uses separate HttpOnly cookies; mutating authenticated calls require the matching CSRF cookie value in `x-csrf-token`.

Prices are integer paise and order submissions are repriced by the server. Catalogues begin empty. The admin explicitly opens each business day; reading business-day status is read-only. A registered table QR is required for dine-in, while pickup needs no table. Tokens are assigned only on admin acceptance and token updates use a MongoDB transaction.

## Current scope notes

This implementation still does **not meet the full master prompt's definition of done**. The product form currently creates one variant and does not yet edit existing names, prices, or variants; category editing/reordering and image replacement controls also need completion. Counter payments require one full payment, there is no adjustment/refund reconciliation for a paid cancellation, and QR rotation returns a URL/token rather than a rendered QR image. ETA uses product preparation metadata plus a simple queue buffer and needs workload tuning. Business-day reporting and transition rules need edge-case review. Automated tests currently cover only health and unauthenticated admin access; they do not cover database-backed workflows, concurrency, business-day boundaries, payment rules, frontend behavior, or the requested end-to-end matrix. Do not use it as a production shop system until those workflows and security review are complete. No real shop catalogue or prices were invented.
