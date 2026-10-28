# Assumptions and open configuration

These items need a decision from ZANN before live patient information is stored.

- The two Google Sheets could not be read. Both export links returned HTTP 403. Import maps column headers; it does not assume those workbooks were inspected. Review `examples/sample-cases.csv` and map the laboratory's real headers on the Import page.
- Stage minutes, elapsed processing, and checklist text are placeholders. Department leads need to replace them with the laboratory's own steps. The software does not define clinical standards.
- Holiday rows for 2026 and 2027 are Ontario statutory-style defaults, including a stored Good Friday of 2026-04-03. Confirm the laboratory's actual closures.
- Business hours default to Monday–Friday, 08:00–16:30 Toronto time.
- An infeasible requested delivery is left unchanged. Release continues only after an authorized user acknowledges the warning.
- Date-only spreadsheet values are interpreted in Toronto time. Excel may display them as locale dates; the importer accepts ISO dates and common month/day/year text.
- Patient names are included in in-app technician notifications because production staff need them. Email stays generic unless `email_include_patient_details` is turned on after a privacy review. SMTP was not connected here.
- Supabase Auth is optional. `AUTH_PROVIDER=local` is the path that was exercised. JWT verification is present and was not run against a live Supabase project.
- This application is not a PHIPA certification, a legal opinion, or a hosting approval. Confirm hosting location, agreements, retention, access logs, and breach response before storing identifiable patient information.
- Attachment metadata has a table. A file upload and download screen is not included yet.
- Eligible technicians are the active members of the stage's department. There is not a separate per-stage eligibility list.
- Seeded workflows are linear. The scheduler can place stages that share a predecessor in parallel when a template is edited that way.
- Fictional names in the demo seed are not ZANN staff, dentists, patients, or measured turnaround times.
