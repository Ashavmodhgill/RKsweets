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

Phase 2 adds customer account registration/login, owner login, logout, customer profile, and protected portal routes. Catalogue, order workflows, payment, and reports are not implemented.

## Phase 2 authentication foundation

Customer registration/login, owner login, logout, customer profile, and protected portal routes are implemented. Customer and owner accounts share the `Account` model; only the customer service creates customer accounts, while the separate owner setup command is the only code path that creates an owner. There is no public owner registration route. The database indexes enforce unique normalized mobile numbers and at most one owner. Production has automatic index creation disabled, so the explicit owner setup command creates these declared auth indexes before creating the first owner.

Mobile numbers are normalized by removing common formatting characters and must then be valid E.164 numbers, including a leading country code such as `+14155550123`. Passwords are hashed with the already-installed `bcryptjs`; the account model excludes password hashes from queries and public object conversion. Session authentication stores only the account ID, renews the session ID on authentication, and resolves role and account details from the database in authorization middleware. Both login POST routes use the dedicated 10-attempt-per-15-minute limiter.

The owner setup command is explicitly invoked with `npm run setup:owner`; it is not part of normal server startup. It reads the existing required `MONGODB_URI` plus `OWNER_SETUP_NAME`, `OWNER_SETUP_MOBILE`, and `OWNER_SETUP_PASSWORD`. The three `OWNER_SETUP_*` variables are needed only when explicitly running the setup command; they do not seed an account during normal startup. The command refuses an existing owner and never resets an existing password. No owner account is created by this step.

## Local setup

Use Node.js 22 or newer. From `v2/server/`, install the pinned dependencies and create the local environment file:

```powershell
npm install
Copy-Item .env.example .env
```

Edit `server/.env` locally. Set the Atlas connection string and two different random session secrets of at least 32 characters. Add the development IP to Atlas Network Access and use a least-privilege database user. Cloudinary values can remain empty until the image integration phase. Never commit `.env`.

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
