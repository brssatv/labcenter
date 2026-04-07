# LabCenter Clinical Portal (Secure Login Scaffold)

This project now includes a server-backed login portal with security controls that are a practical foundation for HIPAA-oriented applications.

## What was added

- Server-side sessions (`httpOnly`, `sameSite=strict`, short session lifetime)
- CSRF protection for state-changing requests
- Brute-force protection (IP limiter + account/IP lockout)
- Security headers via `helmet` (CSP, no sniffing, frame protections)
- Password hashing with `scrypt` (script included for generating new hashes)
- Structured audit logging for authentication events

## Quick start

1. Install dependencies:
   - `npm install`
2. Set environment variables:
   - `cp .env.example .env`
   - Update `SESSION_SECRET` in `.env`.
3. Start the server:
   - `npm run dev`
4. Open:
   - `http://localhost:3000`

## Deploying to `portal.mindbodyheal.co`

This repo now includes a [render.yaml](/Users/greyhouse/Documents/LabCenter/render.yaml) blueprint for deploying the portal to Render behind the `portal.mindbodyheal.co` subdomain.

### Recommended setup

- Keep `mindbodyheal.co` for the public website.
- Host this authenticated app at `portal.mindbodyheal.co`.
- Use a persistent disk and set `DATA_DIR` to that mounted path so sessions, audit logs, and facility data survive deploys.

### Render steps

1. Push this repo to GitHub.
2. In Render, create a new Blueprint or Web Service from the repo.
3. Confirm these runtime settings:
   - Build command: `npm ci --omit=dev`
   - Start command: `npm start`
   - Health check path: `/healthz`
4. Add a persistent disk mounted at `/opt/render/project/src/runtime-data`.
5. Set `SESSION_SECRET` to a strong random value if you are not using the generated one.
6. Add `portal.mindbodyheal.co` as the custom domain on the Render service.

### DNS steps

In the DNS settings for `mindbodyheal.co`, create the record Render asks for when you attach `portal.mindbodyheal.co`. In most setups this is a `CNAME` for `portal` pointing to your Render service hostname.

### Deployment notes

- The server no longer exposes the whole project directory as public static files.
- Facility data is now served through an authenticated API instead of `/data/facility.json`.
- Runtime data can be stored outside the repo via `DATA_DIR` and `SESSION_DIR`.
- Native PDF rendering and OCR are disabled by default on non-macOS hosts. Render deployments start with:
  - `LABCENTER_ENABLE_REPORT_PDF=false`
  - `LABCENTER_ENABLE_SCAN_OCR=false`

## Default bootstrap login (change immediately)

- Email: `admin@clinic.local`
- Password: `ChangeMeNow!123`

The bootstrap user is stored in `/Users/greyhouse/Documents/LabCenter/data/users.json`.

## Create a new password hash

Run:

- `npm run hash-password -- 'YourVeryStrongPasswordHere'`

Then update the user's `passwordHash` in `/Users/greyhouse/Documents/LabCenter/data/users.json`.

## Important HIPAA note

This scaffold helps with key technical controls for authentication, but **it is not complete HIPAA compliance by itself**. You still need operational safeguards, BAAs, risk analysis, workforce training, incident response procedures, and production-grade infrastructure controls.
