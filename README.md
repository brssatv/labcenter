# LabCenter Clinical Portal (Secure Login Scaffold)

This project now includes a server-backed login portal with security controls that are a practical foundation for HIPAA-oriented applications.

## What was added

- Server-side sessions (`httpOnly`, short session lifetime, and `SameSite=Lax` when OIDC redirect login is enabled)
- CSRF protection for state-changing requests
- Brute-force protection (IP limiter + account/IP lockout)
- Security headers via `helmet` (CSP, no sniffing, frame protections)
- Password hashing with `scrypt` (script included for generating new hashes)
- Structured audit logging for authentication events
- Optional admin SSO with OpenID Connect / Keycloak

## Quick start

1. Install dependencies:
   - `npm install`
2. Set environment variables:
   - `cp .env.example .env`
   - Update `SESSION_SECRET` in `.env`.
   - Optional: if you want admin SSO through Keycloak/OpenID Connect, also set:
     - `APP_BASE_URL`
     - `OIDC_ISSUER`
     - `OIDC_CLIENT_ID`
     - optional `OIDC_CLIENT_SECRET`
     - optional `OIDC_SCOPE`
     - optional `OIDC_REDIRECT_URI`
     - optional `OIDC_POST_LOGOUT_REDIRECT_URI`
     - optional `OIDC_REQUIRED_ROLE`
   - If you want shared order history + file persistence, also set:
     - `LABCENTER_S3_BUCKET`
     - `LABCENTER_S3_REGION`
     - optional: `LABCENTER_S3_PREFIX`
     - optional: `LABCENTER_S3_ENDPOINT`
     - optional: `LABCENTER_S3_FORCE_PATH_STYLE=true`
     - plus your AWS credentials (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and if needed `AWS_SESSION_TOKEN`)
3. Start the server:
   - `npm run dev`
4. Open:
   - `http://localhost:3000`

## Run the desktop app locally

1. Start the web server:
   - `npm run dev`
2. In a second terminal, launch Electron:
   - `npm run desktop`

If Electron fails with a `NODE_MODULE_VERSION` mismatch for `better-sqlite3` or `canvas`, rebuild the native modules for Electron and relaunch:

- `npm run desktop:fix`
- `npm run desktop`

## Run local with exported production data

If you want local to show the same Facility records as `portal.mindbodyheal.co`, run the app against an exported runtime-data folder instead of the repo's built-in `data/` snapshot.

1. Export or copy the production runtime-data folder to your machine.
2. Put it somewhere outside git or in the ignored local `runtime-data/` folder.
3. Make sure it includes:
   - required: `facility.json`
   - recommended: `users.json`
   - recommended: `labcenter.sqlite`
4. Start the app against that folder:
   - `PORT=43211 npm run start:runtime-data -- ./runtime-data`
5. Log in as a doctor/admin user if you want to see all Facility records.

Notes:
- If you only copy `facility.json`, the Facility screen can still match production data, but orders, users, and some other runtime state may not.
- `sessions/` does not need to be copied; LabCenter will create it automatically inside the chosen runtime-data folder.

## SOP

Operational instructions for using the app are documented in [SOP.md](/Users/greyhouse/Documents/LabCenter/SOP.md).

## Deploying to `portal.mindbodyheal.co`

This repo now includes a [render.yaml](/Users/greyhouse/Documents/LabCenter/render.yaml) blueprint for deploying the portal to Render behind the `portal.mindbodyheal.co` subdomain.

### Recommended setup

- Keep `mindbodyheal.co` for the public website.
- Host this authenticated app at `portal.mindbodyheal.co`.
- Use a persistent disk and set `DATA_DIR` to that mounted path so sessions, audit logs, and facility data survive deploys.
- The shared SQLite database is stored in `DATA_DIR/labcenter.sqlite`.
- Store uploaded workbooks and generated PDFs in S3 instead of the Render disk.

### Render steps

1. Push this repo to GitHub.
2. In Render, create a new Blueprint or Web Service from the repo.
3. Confirm these runtime settings:
   - Build command: `npm ci --omit=dev`
   - Start command: `npm start`
   - Health check path: `/healthz`
4. Add a persistent disk mounted at `/opt/render/project/src/runtime-data`.
5. Set `SESSION_SECRET` to a strong random value if you are not using the generated one.
6. Add S3 settings on the service:
   - `LABCENTER_S3_BUCKET`
   - `LABCENTER_S3_REGION`
   - optional `LABCENTER_S3_PREFIX` such as `portal-prod`
   - your AWS credentials, unless you are supplying them through another trusted mechanism
7. Add `portal.mindbodyheal.co` as the custom domain on the Render service.

### DNS steps

In the DNS settings for `mindbodyheal.co`, create the record Render asks for when you attach `portal.mindbodyheal.co`. In most setups this is a `CNAME` for `portal` pointing to your Render service hostname.

### Deployment notes

- The server no longer exposes the whole project directory as public static files.
- Facility data is now served through an authenticated API instead of `/data/facility.json`.
- Runtime data can be stored outside the repo via `DATA_DIR` and `SESSION_DIR`.
- Orders, registrations, and upload activity are now persisted in SQLite under `DATA_DIR/labcenter.sqlite`, so they are shared across browsers and survive deploys.
- Uploaded raw result workbooks and generated report PDFs can be pushed to S3 when the `LABCENTER_S3_*` environment variables are configured.
- Render deployments install Chrome for Testing during the build so server-side report PDFs can render on Linux.
- Requisition scan OCR remains disabled by default on Render:
  - `LABCENTER_ENABLE_SCAN_OCR=false`

## Default bootstrap login (change immediately)

- Username: `doctor-001`
- Email: `admin@clinic.local`
- Password: `ChangeMeNow!123`

The bootstrap user is stored in `/Users/greyhouse/Documents/LabCenter/data/users.json`.

When OIDC is configured, the local admin login is disabled and LabCenter admins are redirected through the external identity provider instead. The client portal login stays local.

## Create a new password hash

Run:

- `npm run hash-password -- 'YourVeryStrongPasswordHere'`

Then update the user's `passwordHash` in `/Users/greyhouse/Documents/LabCenter/data/users.json`.

## Billing portal

Administrators can create and manage biller accounts from the **Billing** tab. Billing users sign in at:

- `https://portal.mindbodyheal.co/billing`

Biller credentials are stored separately in `DATA_DIR/billers.json`, passwords are scrypt-hashed, and billing sessions do not receive client, clinical, facility, or administrator access. Set a biller to **Inactive** to block future access. New billing permissions should be added explicitly rather than reusing the client or administrator roles.

## Important HIPAA note

This scaffold helps with key technical controls for authentication, but **it is not complete HIPAA compliance by itself**. You still need operational safeguards, BAAs, risk analysis, workforce training, incident response procedures, and production-grade infrastructure controls.
