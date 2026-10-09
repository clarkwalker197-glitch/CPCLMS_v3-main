# CPCLMS v3

Cordova Public College Library Management System. The project contains an Express/Prisma backend and a Next.js frontend for catalog management, borrowing, reservations, QR approvals, notifications, reports, and authentication.

## Requirements

- Node.js 20 or newer
- PostgreSQL, or the configured Neon PostgreSQL database
- A modern browser for camera-based QR scanning
- Gmail App Password if real password-reset email is enabled

## Project Layout

- `backend/` Express API, Prisma schema, migrations, uploads, and seed data
- `frontend/` Next.js application

## Backend Setup

```powershell
cd backend
npm install
```

### Persistent Cover Image Storage

Create a **public Vercel Blob** store. For a local backend or a backend hosted outside Vercel, set `BLOB_READ_WRITE_TOKEN` in `backend/.env` and in the backend host's environment settings. If the backend runs on Vercel and the Blob store is connected to that Vercel project, the SDK uses Vercel OIDC automatically; no token should be added to frontend variables. Never expose Blob credentials through `NEXT_PUBLIC_*` variables.

Physical-book and e-book cover uploads are held in memory only long enough to validate and send them to Blob. The database stores the returned public HTTPS URL. Pasted external image URLs continue to be stored as supplied. The existing `coverImage` database field is reused; no schema migration is needed. Replacing a cover cleans up an old Blob object only when no book or e-book still references it. Archiving retains covers for restore; expired archives clean up unreferenced Blob objects after the database row is deleted.

Archived users, books, and e-books are automatically purged after 15 days. The backend checks on startup and every 24 hours, so the actual purge can occur up to a day after the retention period. Completed borrowing and audit history is kept with its user/book references detached; expired e-book uploads and unreferenced cover images are also cleaned up. Purging waits while an archived user or book has an active loan, reservation, or pending borrow request.

Existing `/uploads/...` cover paths are not rewritten or assigned invented URLs. External URLs continue to work. Any local-upload cover whose file is missing must be re-uploaded by a librarian; the old row remains unchanged until replaced. The `uploads/` static route remains for existing e-book documents and profile images, but book cover uploads no longer write there.

Apply the database schema and generate Prisma Client:

```powershell
npx prisma migrate status
npx prisma migrate deploy
npx prisma generate
```

Before starting the backend after pulling schema changes, always run `npx prisma migrate status` and fix any pending migrations before launching the app. This catches schema drift like the missing `users.archived_at` column before it reaches runtime.

For a fresh development database, seed demo users and Dewey categories:

```powershell
npm run prisma:seed
```

Start the API:

```powershell
npm run dev
```

The API runs at `http://localhost:4000` by default.

## Frontend Setup

```powershell
cd frontend
npm install
```

Optional frontend environment file:

```env
NEXT_PUBLIC_API_URL=http://localhost:4000/api
```

Start the frontend:

```powershell
npm run dev
```

Open `http://localhost:3000`.

## Demo Accounts

The seed script creates demo users. Use the credentials documented in `backend/prisma/seed.ts` and change them before using the system outside development.

## Main Features

- Librarian book and e-book catalog management
- Dewey Decimal main and subcategory selection with classification auto-detection
- Borrow requests, reservations, due dates, fines, and archive/restore workflows
- Role-based access for librarians, faculty, and students
- QR approval flow with signed, short-lived, single-use tokens
- Manual transaction ID fallback for QR approval
- Gmail SMTP password-reset verification codes
- In-app notification badge, dropdown, read state, and deep-link navigation
- Offline-capable catalog, personal records, notifications, and pending borrow/reservation requests
- Reports, analytics, activity logs, and profile management

## Offline-First Behavior

The frontend uses Dexie over IndexedDB for the cached physical/e-book catalog,
categories, a minimal profile, dashboard snapshots, and account-scoped personal
requests, transactions, reservations, and notifications. The service worker caches
the application shell and static assets only; it does not cache API responses or
authentication data. Unavailable navigations use `public/offline.html`.

Borrow requests and reservation intents created offline are explicitly shown as
**Pending synchronization** and do not change cached availability, queue position,
or transaction status. On reconnect, the centralized queue submits them to Express.
The backend validates current state and role/priority rules, and idempotency keys
deduplicate retries. Transient network/server failures use exponential backoff;
permanent validation/authentication failures and conflicts remain visible as failed
items and are not silently retried. Faculty reservation priority remains enforced by
the backend transaction service.

Notification read actions may be queued. Borrow approval, reservation pickup/cancel,
returns, QR transaction confirmation, librarian mutations, and analytics are
online-only. E-book metadata may be cached; file downloads still need a connection.
The persistent connection indicator labels offline and cached state. Logging out
clears private IndexedDB records, queued mutations, and legacy API/page caches while
preserving the public catalog cache.

Deployments must apply the new `20261005000000_add_mutation_idempotency` Prisma
migration before enabling the updated frontend/backend together. Do not reset or
recreate the production database.

Offline limitations:

- A user must have logged in successfully at least once on that device.
- New authentication, QR confirmation, librarian mutations, returns, and ebook file
	downloads still require a live connection.
- IndexedDB can be disabled or cleared by browser policy; the app then falls back to
	its normal online API behavior.

To test it, run the frontend and backend, apply the idempotency migration to a
non-production test database, then log in while online and open the catalog,
dashboard, and reservations. Switch browser DevTools to Offline, reload cached
pages, search the catalog, and create a borrow request and reservation. Confirm both
show pending synchronization without appearing approved/confirmed. Restore the
connection and verify that the server response replaces each local intent and that
repeated queue delivery with the same key does not create duplicates.

## QR Approval Flow

1. A borrower submits a borrow request.
2. A librarian generates an approval QR code.
3. The QR contains a signed link tied to the request and issuing librarian.
4. The borrower opens the link or scans it with the QR scanner.
5. The backend verifies the signature, expiry, stored hash, issuer role, and single-use state.
6. Approval is attributed to the issuing librarian, never to the borrower.

QR approval tokens expire after ten minutes. The public approval endpoint is rate limited and accepts only validated request payloads.

## Email Troubleshooting

If Forgot Password returns an email configuration error, check that `EMAIL_USER` and `EMAIL_PASS` are present in `backend/.env`. Gmail must have two-step verification enabled and an App Password created for SMTP access.

## Validation Commands

```powershell
cd backend
npm run build

test for cubic

cd ..\frontend
npx tsc --noEmit
```

Do not commit `.env`, database credentials, Gmail App Passwords, uploaded files, or generated build output.
