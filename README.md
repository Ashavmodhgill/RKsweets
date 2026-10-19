# RK Sweets

<p align="center">
  <img
    src="assets/banner.png"
    alt="RK Sweets — Tradition in Every Bite"
    width="100%"
  />
</p>

<p align="center">
  A premium sweets storefront with a rich maroon-and-gold identity.
</p>

A full-stack ordering and shop-management application for RK Sweets. V2
separates the customer storefront from the owner portal while sharing
the configured application database.

> **Status note:** Customer ordering, owner order management,
> product/category management, receipts, notifications, and Business Day
> management are reported as implemented. Dining System
> enhancements---table management, secure QR workflow, multiple orders
> per table visit, and manual table clearance---are the next stage.
> Verify the current source and tests before treating any feature as
> production-ready.

## Contents

- [RK Sweets](#rk-sweets)
  - [Contents](#contents)
  - [Overview](#overview)
  - [Architecture](#architecture)
  - [Features](#features)
    - [Customer portal](#customer-portal)
    - [Owner portal](#owner-portal)
    - [Orders, tokens, and receipts](#orders-tokens-and-receipts)
    - [Business Day](#business-day)
  - [Technology](#technology)
  - [Requirements](#requirements)
  - [Local setup](#local-setup)
    - [Owner account setup](#owner-account-setup)
    - [Database scripts](#database-scripts)
  - [Environment configuration](#environment-configuration)
  - [Commands](#commands)
  - [Business rules](#business-rules)
  - [Database and deployment](#database-and-deployment)
  - [Security](#security)
  - [Testing](#testing)
  - [Next steps](#next-steps)

## Overview

RK Sweets V2 supports customer product browsing and ordering, owner-side
product and order management, pickup with payment at the counter,
Business Day opening/closing, and dine-in functionality as supported by
the current implementation.

## Architecture

Local development uses two Express processes:

  Service              Default URL                Command
  -------------------- -------------------------- ------------------------
  Customer portal      `http://localhost:3000/`   `npm run dev:customer`
  Owner/admin portal   `http://localhost:3001/`   `npm run dev:admin`

Run these commands from the `server` directory. The owner portal is
served from the root of its own service, not necessarily from `/admin`.

The design uses separate customer and owner authentication
models/collections and separate session secrets. The intended future
hosting arrangement is three services: customer portal, backend/API, and
owner/admin portal. Confirm actual deployment configuration before
deploying.

## Features

### Customer portal

-   Customer registration and login.
-   Authenticated cart with server-side validation.
-   Product catalogue, product details, and category filters.
-   Checkout that reloads product data and recalculates prices.
-   Order confirmation, customer-scoped order details, and order
    history.
-   Order notifications.

### Owner portal

-   Protected owner authentication and management routes.
-   Product create/edit/availability management.
-   Product image handling through the configured Cloudinary
    integration.
-   Product category create/rename/activate/deactivate.
-   Order listing, filtering, details, acceptance, rejection, and
    completion.
-   Preparation-time suggestions and owner adjustments where supported.
-   Receipts and Business Day management.

### Orders, tokens, and receipts

-   Order items preserve product, unit, quantity, price, and
    preparation-time snapshots.
-   Currency values are handled in integer paise.
-   Orders enter the pending-owner-acceptance workflow.
-   Official tokens are issued through owner acceptance, subject to
    Business Day rules.
-   Rejected orders require a reason.
-   Payment is in person at the counter; order completion must not
    automatically mean payment was received.
-   Checkout retries use an idempotency strategy to reduce duplicate
    orders.

### Business Day

Business Day controls ordering eligibility and supports
closing/reporting. Its existing implementation is the source of truth
for business-date and token eligibility. Verify the configured timezone
before deployment. Do not reset token counters or release dining tables
as an incidental effect of closing.

## Technology

The codebase uses Node.js, Express, MongoDB, Mongoose, EJS, HTML/CSS,
client-side JavaScript, session-based authentication, and Cloudinary
where configured. Check `server/package.json` for exact dependency
versions and available scripts.

## Requirements

-   A compatible Node.js/npm version for the repository.
-   A configured MongoDB deployment.
-   Cloudinary credentials for live image uploads.
-   Strong, separate customer and owner session secrets.

Some transaction-based workflows require MongoDB on a replica set or
sharded cluster; a standalone MongoDB server may not support them.

## Local setup

1.  Open the project and server directory:

    ``` powershell
    cd "D:\RAWJET\github\RKsweets-1\v2\server"
    ```

2.  Inspect `package.json`, the lockfile, and `.env.example`. Install
    dependencies only when needed and after confirming the repository's
    package manager:

    ``` powershell
    npm install
    ```

3.  Create a local environment file using the existing `.env.example` as
    the source of truth. Never commit `.env`.

4.  Configure the database URI, separate session secrets, and any
    Cloudinary variables required by the source code.

5.  Start the customer service in one terminal:

    ``` powershell
    npm run dev:customer
    ```

6.  Start the owner service in a second terminal:

    ``` powershell
    npm run dev:admin
    ```

7.  Open the URLs in the Architecture table.

### Owner account setup

The repository has an owner bootstrap command:

``` powershell
npm run setup:owner
```

Run it only after reviewing its implementation, confirming the intended
local/staging database, setting the required bootstrap variables, and
verifying that creating the owner account is intended. Do not run it
against production unintentionally.

### Database scripts

Before running migrations or index/setup scripts, read their
implementation, confirm the target database, take a verified backup, and
use dry-run/verification modes where available. Do not run scripts
against production just to make local development start.

## Environment configuration

Use `server/.env.example` and the environment validation code as the
authoritative list of variables. Known variables include:

-   `MONGODB_URI`
-   `ADMIN_SESSION_SECRET`
-   `CUSTOMER_SESSION_SECRET`

Owner bootstrap may additionally require `OWNER_SETUP_NAME`,
`OWNER_SETUP_MOBILE`, and `OWNER_SETUP_PASSWORD` when explicitly
creating an owner account.

Take Cloudinary and business-timezone variable names from the current
source code; do not guess them. Use strong unique session secrets (at
least 32 characters where required). Never publish secret values in this
file or commit them to Git.

## Commands

Run commands from `server`, unless the repository says otherwise.

  -----------------------------------------------------------------------
  Command                             Purpose
  ----------------------------------- -----------------------------------
  `npm run dev:customer`              Start the customer service

  `npm run dev:admin`                 Start the owner/admin service

  `npm run check`                     Run static/application checks

  `npm test`                          Run automated tests

  `npm run setup:owner`               Bootstrap the owner account; review
                                      prerequisites first
  -----------------------------------------------------------------------

Other scripts may prepare checkout indexes or migrate categories.
Inspect `package.json` and each script before running it.

## Business rules

-   Customers must authenticate before placing orders.
-   The server validates availability, units, and prices; client totals
    are not authoritative.
-   Products assigned to inactive categories must not be purchasable.
-   Owner actions require server-side authorization and CSRF protection.
-   Tokens follow the existing owner-acceptance and Business Day rules.
-   Rejection reasons must be recorded and communicated through the
    existing notification flow.
-   Payment at the counter is separate from order completion unless
    payment recording is explicitly implemented.
-   Customer order and receipt routes must only expose that customer's
    records.
-   Dine-in eligibility must be validated server-side, not inferred from
    a submitted table number alone.
-   **Planned dining rule:** the owner manually marks a table cleared;
    multiple orders may belong to one table visit. Do not assume this is
    fully implemented until the dining work and tests are complete.

## Database and deployment

-   Use local or staging databases for development and testing.
-   Avoid real customer data in routine tests.
-   Confirm transaction support before testing transaction-dependent
    order/token operations.
-   Run indexes and migrations only through a controlled process.
-   Configure environment variables separately for each deployed
    service.
-   Keep owner-only management routes protected.
-   Use HTTPS and secure production cookie settings appropriate to the
    hosting platform.
-   Test Cloudinary uploads, QR scanning, sessions, and full order flows
    in staging before release.
-   Back up the database before production schema changes.

## Security

-   Never commit `.env`, database credentials, session secrets,
    bootstrap passwords, or Cloudinary secrets.
-   Do not log passwords, session IDs, or private QR credentials.
-   Keep authentication, authorization, CSRF checks, validation, and
    ownership checks on the server.
-   Use the existing password hashing and session handling.
-   Do not trust client-submitted prices, statuses, tokens, or table
    identities.

## Testing

Run from `server`:

``` powershell
npm run check
npm test
git diff --check
```

Passing static checks and unit tests does not prove database
transactions, concurrent requests, browser behavior, QR scanning, image
uploads, or production deployment are correct.

Before release, test customer registration/login, cart and checkout,
owner product/category management, order transitions, token uniqueness,
Business Day opening/closing, receipts, Cloudinary uploads, responsive
layouts, and the dining workflow once implemented.

## Next steps

The planned Dining System enhancements are: 1. Owner table management.
2. Secure QR credential validation and revocation. 3. Multiple orders
per table visit. 4. Occupancy independent of individual order status. 5.
Owner-controlled manual table clearance. 6. Integration with Business
Day and existing order/token workflows.

Reservations, split billing, online payments, waiter accounts, and
advanced queue prediction are outside the initial scope unless
explicitly added later.
