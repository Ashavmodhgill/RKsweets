# RK Sweets V2

V2 is a server-rendered application using Node.js, Express, EJS, and MongoDB Atlas. It keeps the three application areas in `admin/`, `customer/`, and `server/`. The existing legacy project and the separate `RKsweets-v2/` directory are outside this application.

## Current foundation

- Customer portal: `http://localhost:3000/`
- Admin portal: `http://localhost:3001/`
- Each process exposes `/health` and `/ready` on its own port.
- The server loads portal templates and static assets from their own directories.
- Admin and customer sessions use separate secrets, cookie names, and MongoDB session collections.
- Session cookies are HttpOnly, SameSite=Lax, and Secure in production.
- Mutating requests require a session CSRF token in a form `_csrf` field or the `x-csrf-token` header.
- MongoDB connection and required environment values are checked before the HTTP listener starts.

Phase 2 provides customer account registration/login, owner login, logout, customer profile, and protected portal routes. Phase 3 provides owner product management and a customer-facing product catalogue. Phase 4.1 provides an authenticated customer cart. Phase 4.2 adds customer checkout and pending orders. Phase 4.3 adds owner order acceptance, rejection, and completion. Phase 4.4 adds in-app notifications and printable order receipts; online payment is not implemented.

## Phase 2 authentication foundation

Customer registration/login, owner login, logout, customer profile, and protected portal routes are implemented. Customers and owners use separate Mongoose models and collections: `Customer` uses `customers`, while `Owner` uses `owners`. Customer registration can create only a customer; the explicit owner setup command is the only code path that creates an owner. There is no public owner registration route. Each collection has its own unique mobile index, and the owner collection has a unique primary-owner key. Production has automatic index creation disabled; `npm run setup:customer-indexes` creates only customer indexes, while `npm run setup:owner` creates owner indexes before creating the owner.

The prior shared `accounts` collection is not migrated or modified by this architecture change. Records in that collection will not authenticate through the new models. Before using existing accounts, plan an explicit data migration that copies customer and owner records into their respective collections, preserves password hashes and (if retaining sessions) document IDs, removes the shared `role` field, assigns `ownerKey: "primary"` to the sole owner, and handles existing sessions. Run customer index setup after customer migration and resolve duplicate mobile numbers before enabling registration. Do not run owner setup before deciding how any existing owner record will be migrated; otherwise a new owner can be created in `owners` while the prior record remains in `accounts`.

Mobile numbers are normalized by removing common formatting characters and must then be valid E.164 numbers, including a leading country code such as `+14155550123`. Passwords are hashed with the already-installed `bcryptjs`; the account model excludes password hashes from queries and public object conversion. Session authentication stores only the account ID, renews the session ID on authentication, and resolves role and account details from the database in authorization middleware. Both login POST routes use the dedicated 10-attempt-per-15-minute limiter.

The owner setup command is explicitly invoked with `npm run setup:owner`; it is not part of normal server startup. It reads the existing required `MONGODB_URI` plus `OWNER_SETUP_NAME`, `OWNER_SETUP_MOBILE`, and `OWNER_SETUP_PASSWORD`. The three `OWNER_SETUP_*` variables are needed only when explicitly running the setup command; they do not seed an account during normal startup. The command refuses an existing owner and never resets an existing password. No owner account is created by this step.

## Local setup

Use Node.js 22 or newer. From `v2/server/`, install the pinned dependencies and create the local environment file:

```powershell
npm install
Copy-Item .env.example .env
```

Edit `server/.env` locally. Set the Atlas connection string and two different random session secrets of at least 32 characters. Add the development IP to Atlas Network Access and use a least-privilege database user. Product image uploads require `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`; these are read only by the server and are never sent to browser pages. Product management and browsing work without Cloudinary configured, but image upload will return a service-unavailable response. Never commit `.env`.

Run either portal independently. Start both commands in separate terminals:

```powershell
npm run dev:customer
npm run dev:admin
```

The customer server uses `PORT` (3000 by default); the admin server uses `ADMIN_PORT` (3001 by default). Production commands are `npm run start:customer` and `npm run start:admin`. Both processes use the same MongoDB database URI, but use separate session secrets, cookies, and session collections. `npm start` and `npm run dev` remain aliases for the customer server. `npm run check` parses application JavaScript files while excluding dependency and generated-output directories.

## Structure

```text
v2/
├── admin/
│   ├── views/pages/       Admin EJS pages
│   ├── views/partials/    Admin reusable EJS partials
│   └── public/            Admin CSS, browser JS, images
├── customer/
│   ├── views/pages/       Customer EJS pages
│   ├── views/partials/    Customer reusable EJS partials
│   └── public/            Customer CSS, browser JS, images
└── server/
    ├── config/            Environment and database setup
    ├── controllers/       HTTP request coordination, including authentication
    ├── middlewares/       CSRF, validation, and error handling
    ├── models/            Mongoose schemas
    ├── routes/            Authentication, portal, and health routes
    ├── services/          Business workflows
    ├── tests/             Server and workflow tests
    ├── utils/             Shared server helpers
    ├── views/shared/      Shared server error templates
    ├── public/            Optional shared static assets
    ├── app.js             Portal-specific Express configuration
    ├── server.js          Customer server entry point
    ├── admin-server.js    Admin server entry point
    └── start-portal.js    Shared startup and graceful shutdown
```

Each server mounts only its portal at `/`; the admin and customer areas are separated by port and process. No domain ownership or DNS configuration is assumed.

## Product categories

Owners manage product categories at `/categories` in the admin portal. Category creation and renaming normalize Unicode, surrounding whitespace, repeated spaces, and case for duplicate detection. Category slugs remain stable after a rename; active status controls customer visibility. Categories are deactivated rather than deleted, so product associations are retained. Product creation uses an active-category dropdown. Editing preserves an existing inactive or legacy category until the owner explicitly selects an active replacement. New product creation is blocked while no active category exists.

The customer home and catalogue filters read active categories from `product_categories` and filter products server-side by the category reference. A category with no matching products remains selectable and shows an empty state. Products referencing inactive categories are hidden from the catalogue and product detail routes; they are also excluded from cart and checkout reads. Products still carrying only the legacy text field remain visible until migrated, but are not included in category-specific filters.

### Legacy category migration (not run automatically)

The existing `products.category` string is retained as a legacy field. The migration adds `categoryId` references without unsetting or rewriting that string. Before any migration, confirm the intended local/staging database, take a restorable backup, and inspect the existing product and category collections and indexes. Do not run these commands against an unconfirmed or production target.

From `server/`, first create/verify the required indexes, then run a dry-run report:

```powershell
npm run setup:product-category-indexes
npm run migrate:product-categories
```

Review scanned products, planned category mappings, normalized aliases, blank/missing values, and ambiguous references or slug collisions. The migration refuses to write if missing or ambiguous values are reported. After correcting those records and reviewing the report, apply the migration explicitly:

```powershell
npm run migrate:product-categories -- --apply
npm run migrate:product-categories
```

The migration is idempotent: a second run should report no remaining legacy products to reference. Verify product/category reference counts and sample customer/admin views against the target data. Keep `products.category` until a separately reviewed verification confirms every required product is correctly mapped and a later cleanup plan is approved. This feature does not remove the legacy field or change historical order/receipt snapshots.

## Business day opening and closing

Owners manage the business day from **Business Day** in the admin sidebar. Opening and closing are explicit owner actions. The configured `BUSINESS_TIMEZONE` determines the date used when the owner opens a day. An open day continues across a server restart and is not automatically closed or replaced at midnight. Customers cannot place orders unless the active day is open; pending orders cannot be accepted after closing starts. During closing, the owner can still reject pending orders and complete accepted/preparing/ready orders. Finalization is blocked until those orders are resolved.

Closed-day reports snapshot order counts by the existing order statuses, accepted/rejected/completed counts, gross order value in integer paise from persisted order price snapshots, fulfilment totals, and issued tokens. Gross order value is not collected sales. Payment remains in person, so paid sales are reported as **not recorded**; completion is not evidence of payment. The report does not read current product prices.

Before using the workflow on a controlled database, take a backup and confirm the target database. The deployment must support MongoDB multi-document transactions (a replica set or sharded cluster; a standalone MongoDB server is insufficient). Review existing orders that lack `businessDate`, especially unresolved orders, before enabling the feature. Then run `npm run setup:business-day-indexes` from `server/` against the confirmed target. This creates the unique business-date and single-active-day indexes, plus the order business-date/status index. Resolve any duplicate or conflicting data reported by index creation before enabling writes. No setup script is run by the application automatically.

Checkout, owner acceptance/token allocation, order resolution, closing, and report finalization write the same business-day record within transactions. This serializes their state changes with the open/closing/closed transition. The code and mocked tests do not verify real transaction behavior or index creation; deploy only after validating them in a safe replica-set staging environment. Historical orders created before this feature have no business-day association and are not retroactively assigned or included in a day report. Unresolved legacy orders block opening until resolved.

Run `npm run check` and `npm test` from `server/` for local checks. Migration and index commands connect to the configured `MONGODB_URI` when run; they were not run as part of implementation.

## Phase 3 product catalogue

The owner can manage products at `/products` on the admin portal. Mutations use the owner session and CSRF protection. Customers with an account can browse the catalogue at `/products` on the customer portal; only public catalogue fields are rendered there. Product prices are stored as integer paise. Weight products use an amount and `g`/`kg` unit; piece products use a quantity-per-piece value. Unavailable products remain visible with an unavailable status.

Images are uploaded server-to-server to Cloudinary using Node's built-in `fetch`, `FormData`, `Blob`, and crypto APIs; no Cloudinary SDK or additional package is required. The server accepts JPEG, PNG, and WebP files up to 4 MiB, checks their content signatures, and stages image metadata in the owner session. The secure URL and Cloudinary public ID are saved only with the product record. Replacing or deleting a product commits the database change before requesting cleanup of the old Cloudinary image; cleanup failures can leave an unreferenced Cloudinary image that should be reviewed separately.

Phase 3 did not seed or migrate product records. The `products` collection and its indexes are managed by Mongoose; production index creation remains subject to the existing deployment/index-management process. The separate category-reference migration is documented above.

## Phase 4.1 customer cart

Customers must sign in to add products to their cart. Cart lines are stored in the customer session, tied to that session's authenticated customer ID, and protected by the existing CSRF middleware. Each product can appear only once; repeated additions increase its quantity. Quantities are whole-number units from 1 to 99. For a weight product, one cart unit is one pack of the product's configured weight (for example, quantity 2 for a 500 g listing means two 500 g packs). The product schema does not support arbitrary or fractional weight increments. Prices and availability are reloaded from the current product records whenever a customer page is rendered, and deleted or unavailable products are removed from the cart.

## Phase 4.2 checkout and customer orders

Customers can continue from `/cart` to `/checkout` and submit a pickup or dine-in order. Pickup requires no extra form fields; dine-in is offered only when the customer session has a verified active table selected by scanning its QR. The QR URL format is `/checkout?table=<table-number>`. V2 looks up that value in the `dining_tables` collection and accepts it only when a matching record is active. Configure one `DiningTable` record per real table before enabling dine-in QR codes (for example, `{ tableNumber: "T-04", isActive: true }`); the QR should open `/checkout?table=T-04`. Unknown and inactive table values are rejected. If no table records are configured, checkout remains available for pickup and dine-in stays disabled. The customer must be signed in before checkout. Production disables automatic index creation; run `npm run setup:checkout-indexes` from `server/` against the intended database before adding table records.

Order placement reloads products, checks the checkout quote, calculates totals in paise, snapshots item/unit/price/preparation/customer/table details, and creates an order with `pending_owner_acceptance` status. The session cart is cleared only after the order is persisted. A deterministic MongoDB `_id` derived from the authenticated customer and a random checkout key makes repeated submissions idempotent without issuing an official order token. Customers can view only their own order confirmation and subsequent owner decision. Payment is in person; no payment processor is included. The product's configured `prepMinutes` value is recorded per item and is not changed into a promised ready-time estimate.

## Phase 4.3 owner order management

Owner order management is available at `/orders` on the admin portal. Customers can access their own order history at `/orders` and their order details at `/orders/:orderId`. Acceptance is an atomic status transition that allocates a unique sequential numeric token for the order's local business date; numbering resets daily in `BUSINESS_TIMEZONE`. Acceptance and token allocation use a MongoDB transaction, so the production database must support transactions (MongoDB Atlas replica sets do). The checkout index setup command ensures the token-counter collection exists before transaction use; run `npm run setup:checkout-indexes` from `server/` against the intended database during deployment/index setup. The preparation suggestion is the maximum `prepMinutes` snapshot among ordered items, treating item preparation as parallel; it is an operational estimate only, not a queue prediction or exact completion promise. Owners may confirm another whole-minute estimate up to 1440 minutes and must record a reason for a changed value. Customers see the official token and confirmed estimate only after acceptance, or the owner's rejection reason if rejected. Only accepted, preparing, or ready orders may be marked completed.

## Phase 4.4 notifications and receipts

Both authenticated portals provide `/notifications`, an unread-count badge, and in-app notification updates. The badge checks for updates every 25 seconds while the page is visible and pauses while hidden. Notifications are stored per owner/customer recipient; customer queries are scoped to the signed-in customer. Order events are first persisted in an embedded order outbox alongside order placement or owner status transitions, then delivered idempotently to the notification collection. A failed delivery leaves the outbox event pending for a later retry when that recipient checks notifications. Owner events cover new orders; customer events cover acceptance and token/estimate confirmation, rejection with its reason, and completion. The schema contains a `ready` status, but the current owner workflow has no transition to it, so this implementation does not add one or emit a ready notification. If a ready transition is added in a later approved workflow change, it should append the existing ready event to the outbox atomically.

Customers can print their own order receipt at `/orders/:orderId/receipt`; owners can print an order receipt at the same path on the admin portal. Receipts use persisted item and price snapshots and display amounts in INR from integer paise. They do not assert that payment was received and include no tax/legal invoice fields. The checkout index setup command also creates notification indexes; it must only be run against the explicitly selected deployment database as part of a planned index operation. No new environment variables are required.

Run the existing checks from `server/` with `npm run check` and `npm test`. Browser rendering/printing and MongoDB index/outbox delivery behavior require separate portal and database verification; these checks do not run automatically as part of the local mocked test suite.

Manual portal verification: sign in to the customer portal, place a test order, and confirm the customer notification center shows only that customer's updates and that the order receipt shows the persisted item snapshots and unpaid wording. Sign in separately to the owner portal, confirm the new-order notification links to the owner order page, then accept and reject separate test orders and verify the resulting customer notifications. Mark a notification read and confirm its unread badge decreases. Open a customer's receipt from their order page and use the print button; verify the printed page contains the receipt but not portal navigation. Confirm an authenticated customer receives not-found for another customer's order/receipt URL. Database verification requires a separately approved local/staging MongoDB target; inspect existing collections and indexes first, then schedule `npm run setup:checkout-indexes` from `server/` only after confirming the target and backup/rollback plan. This task did not run that command.
