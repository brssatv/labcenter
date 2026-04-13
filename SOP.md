# LabCenter Standard Operating Procedure (SOP)

## Purpose
This SOP explains how clinic staff should use LabCenter for login, requisition intake, order creation, result processing, reporting, facility management, and client portal access.

## Scope
Use this SOP for the current LabCenter web app or desktop Electron app included in this repository.

## Roles
- Doctor login: full internal workflow access, including Facility, Requisition, Order History, Master Registry, and Panel Master.
- Client portal login: limited workflow based on assigned access.
  - `report_view`: Dashboard, Patient Search, Order History
  - `report_view_order`: Dashboard, Requisition, Patient Search, Order History

## Prerequisites
- Node.js 18 or newer
- Dependencies installed with `npm install`
- Environment configured:
  - `cp .env.example .env`
  - Set `SESSION_SECRET` in `.env`
- Optional features:
  - `LABCENTER_ENABLE_REPORT_PDF=true` for PDF report rendering
  - `LABCENTER_ENABLE_SCAN_OCR=true` for requisition scan autofill

## Startup Procedure
### Web app
1. Run `npm run dev`.
2. Open [http://localhost:3000](http://localhost:3000).

### Desktop app
1. Start the server with `npm run dev`.
2. In a second terminal, run `npm run desktop`.

## Login Procedure
### Doctor login
1. Open the app.
2. Keep `Doctor Login` selected.
3. Enter doctor email and password.
4. Click `Sign In`.

Default bootstrap credentials:
- Email: `admin@clinic.local`
- Password: `ChangeMeNow!123`

Change this password immediately after first use.

### Client portal login
1. Open the app.
2. Select `Client Portal Login`.
3. Enter portal username and password.
4. Click `Sign In`.

Client portal credentials are created from the `Facility` screen under account or provider login settings.

## Standard Daily Workflow
### 1. Review dashboard
1. Open `Dashboard`.
2. Review:
   - total specimens
   - total samples
   - detected pathogens
   - pending orders
   - recent collection activity

Use this page as the daily operational summary.

### 2. Create or update facility records
Use this when onboarding a new client account or provider.

1. Open `Facility`.
2. Choose `Accounts` or `Providers`.
3. Use search to find an existing record or click `Add Account` or `Add Provider`.
4. Complete the modal sections.

Important sections:
- `Basic Information` / `Provider Info`: core identity and contact details
- `Configuration`: account or provider settings
- `Login and Access`: portal username, password, and access type

When setting up client portal access:
1. Open the account or provider record.
2. Go to `Login and Access`.
3. Enter portal username.
4. Enter a password.
5. Choose the access level.
6. Save the record.

Use the `Login` button in the table to jump directly to the access section for an existing record.

### 3. Create a requisition
1. Open `Requisition`.
2. Stay on `Create Requisition`.
3. Complete:
   - Facility Information
   - Patient Information
   - Specimen Information
   - Billing Information
   - Allergies, if needed

Helpful behaviors:
- Patient ID auto-generates if needed.
- ZIP code can autofill city, state, and country.
- The patient search bar at the top can load an existing patient into the form.
- `Upload Scan Copy` can autofill recognized fields from a scanned requisition. Always review imported values before saving.

Save options:
- `Save Requisition`: saves the intake record only.
- `Register And Order`: saves the requisition and immediately opens order entry.

### 4. Review saved requisitions
1. Open `Requisition`.
2. Switch to `View Requisition`.
3. Search or filter by order, accession, patient, patient ID, date range, or lab code.
4. Open a row when you need to continue work from an existing requisition.

### 5. Create an order
This usually starts from `Register And Order`.

1. Confirm patient details in the order screen.
2. Set:
   - `Sample Collect Time`
   - `Order Booking Time`
   - order source
3. Click `Add Service` if more than one service is needed.
4. For each line:
   - choose a panel
   - choose one or more ICD codes allowed for that panel
   - confirm price and concession
5. Click `Confirm and Order`.

Behavior to know:
- Each service line becomes its own order record in `Order History`.
- New orders are created with `Pending` status.
- Accession numbers are generated automatically from panel prefix, date, and order ID.

### 6. Search for a patient
1. Open `Patient Search`.
2. Search by:
   - name
   - contact
   - DOB
   - MRN
   - patient ID
3. Use sorting and filter controls on the results table as needed.

This screen combines built-in patient samples and saved requisition records.

### 7. Upload test results
1. Open `Order History`.
2. Select the `Upload Test Results` tab.
3. For a single order:
   - choose a pending order
   - attach the workbook file
   - click `Upload Results`
4. For bulk processing:
   - attach multiple workbook files
   - click `Bulk Upload Pending Orders`

Expected behavior:
- Matching pending orders are updated to `Processed`.
- Upload activity is logged in the upload activity table.
- Bulk upload tries to match workbook accession/sample identifiers to pending orders.

### 8. Validate results and generate reports
1. Open `Order History`.
2. Use filters or search to find the order.
3. Use row actions as needed:
   - `Validate`: review and save processed result content
   - `Preview`: open a read-only result preview
   - `Generate Report`: generate the detailed final-style PDF
   - `Summary Report`: generate the summary PDF
   - `Final Report`: generate the final report PDF

Status guidance:
- `Pending`: order created, no workbook processed yet
- `Processed`: workbook uploaded and attached
- `Validated`: reviewed in the validation workflow

If report generation fails, verify PDF rendering is enabled and the report assets/helpers are available.

## Master Data Maintenance
### Master Registry
Use `Master Registry` to manage:
- organisms
- antibiotic resistance genes
- ICD codes

Standard use:
1. Search or filter the active tab.
2. Click `Add Organism`, `Add Gene`, or `Add ICD Code`.
3. Save the new record.

Use this screen before mapping new organisms to panels.

### Panel Master
Use `Panel Master` to manage:
- panel definitions
- aliases
- pricing
- accession prefixes
- ICD mappings
- organism-to-panel mappings

Standard use:
1. Search for the panel.
2. Click `Edit` to update an existing panel or `Add Panel` to create a new one.
3. Maintain ICD codes and prefix values carefully.
4. Expand a panel row to add or remove organism mappings.

Operational caution:
- Removing a panel also removes its registry mappings.
- New ICD codes should exist in `Master Registry` first.

## Logout Procedure
1. Click `Logout` from the left navigation.
2. Confirm you return to the login screen before leaving the workstation.

## Data Handling Notes
- Doctor authentication is server-backed.
- Facility account and provider records are stored in server-side JSON data.
- Requisitions and orders are currently stored in browser local storage for the active workstation/profile.
- Use the same browser profile or desktop session consistently if you need continuity for requisitions and orders.

## Troubleshooting
### Cannot log in as doctor
- Confirm the correct email is used.
- Verify the password in `data/users.json` matches the expected hash.
- Check that `.env` exists and `SESSION_SECRET` is set.

### Client portal login fails
- Confirm the portal username and password were configured in `Facility`.
- Confirm the access type is not `no_login`.

### Upload Scan Copy does not work
- Confirm OCR is enabled with `LABCENTER_ENABLE_SCAN_OCR=true` when required by the environment.
- Retry with a clearer PDF or image.

### Report buttons fail
- Confirm the order has a processed report attached.
- Confirm PDF rendering is enabled with `LABCENTER_ENABLE_REPORT_PDF=true`.
- Restart the server if the render endpoint is unavailable.

### Workbook upload does not update an order
- Confirm the order is still `Pending`.
- Confirm the workbook sample/accession identifier matches the order accession number.

## Revision Control
- SOP owner: LabCenter project maintainer
- Review cadence: update this SOP whenever a workflow, access rule, or data behavior changes
