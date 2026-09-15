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
copy .env.example .env
```

Edit `backend/.env` with:

```env
NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://...
JWT_SECRET=at-least-16-characters
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=another-secret-at-least-16
JWT_REFRESH_EXPIRES_IN=7d
FRONTEND_URL=http://localhost:3000
COOKIE_SECRET=change-this-secret
RATE_LIMIT_ENABLED=false
EMAIL_USER=yourgmail@gmail.com
EMAIL_PASS=your_16_digit_gmail_app_password
```

`EMAIL_PASS` must be a Gmail App Password. Do not use a normal Gmail account password. Keep `.env` private.

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
- Offline-first catalog, personal records, notifications, and queued borrow requests
- Reports, analytics, activity logs, and profile management

## Offline-First Behavior

The frontend uses Dexie over IndexedDB as an optional local cache. After a successful
online session, the app stores the physical/e-book catalog, categories, current user,
personal borrow requests and transactions, reservations, and recent notifications.
Cached records render immediately on later visits while the API refreshes them in the
background. The server remains authoritative whenever it is reachable.

Borrow requests and notification read actions made while offline are stored in an
ordered queue. The queue is pushed in creation order when the browser fires an
`online` event or the app starts with a connection. A small status indicator reports
offline mode or pending actions. Logging out clears the local database for privacy.

Offline limitations for this first pass:

- A user must have logged in successfully at least once on that device.
- QR approval, librarian mutations, new authentication, and e-book file downloads
	still require a live connection.
- IndexedDB can be disabled or cleared by browser policy; the app then falls back to
	its normal online API behavior.

To test it, run the frontend, log in while online, open the catalog and dashboard,
then use browser DevTools to switch Network to Offline. Reload those pages and submit
a borrow request or mark notifications as read. Restore the connection and confirm
the pending indicator clears and the request appears after synchronization.

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

cd ..\frontend
npx tsc --noEmit
```

Do not commit `.env`, database credentials, Gmail App Passwords, uploaded files, or generated build output.
