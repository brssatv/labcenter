# Deploy LabCenter In on Render

Repository: https://github.com/brssatv/labcenter
Custom domain: https://portal.labcenter.in

## Create the service

1. In Render, select **New → Blueprint** and connect this GitHub repository. Grant Render access to the repository if it is private.
2. Select `main` and the root `render.yaml` file.
3. Review the paid Starter service in Singapore and its 5 GB persistent disk, then deploy.
4. Confirm the deployment logs show the server started and `/healthz` returns a successful response.

The Blueprint generates the session secret, uses Indian Standard Time, and sets the public app origin. SQLite, appointments, sessions, facility records, and audit logs are saved under `/opt/render/project/src/runtime-data` on the persistent disk. Use a single instance for this local-file storage design.

## Connect the domain

1. Open the service's **Settings → Custom Domains** and confirm `portal.labcenter.in` is listed. Add it if necessary.
2. At the DNS provider for `labcenter.in`, add a **CNAME** with host/name `portal`, targeting the service's exact `onrender.com` hostname shown by Render. Do not include `https://` or a path.
3. Verify the domain in Render. Render provisions HTTPS after DNS verification. Test the app at `https://portal.labcenter.in`.

Do not point this subdomain at localhost or change the root domain's records.

## Production login and data

The current app seeds a new runtime directory from `data/users.json` and `data/facility.json`. These are existing lab records, not a fresh India hospital dataset. Review the seed records and configure the intended production administrator before inviting users. The documented bootstrap password is for local testing; replace its password hash using `npm run hash-password -- 'your-new-password'` and update the intended user's `passwordHash`.

When OIDC is configured, administrator login switches to SSO. Set `OIDC_ISSUER`, `OIDC_CLIENT_ID`, and any required secret in Render, with the callback registered as `https://portal.labcenter.in/auth/oidc/callback`.

The production disk does not automatically receive local SQLite data or appointments. Transfer the intended runtime data separately if migration is required. Email and fax publishing are disabled by default. Configure S3 separately for uploaded workbooks and generated report storage; no storage credentials are included in the Blueprint.

## Verification

- Sign in, open Appointments, and confirm the page loads.
- Create a test appointment and verify that an overlapping slot for the same doctor is rejected.
- Restart the service and confirm the appointment persists.
- Verify PDF generation if that workflow will be used.

Official guidance: https://render.com/docs/blueprint-spec, https://render.com/docs/disks, https://render.com/docs/custom-domains
