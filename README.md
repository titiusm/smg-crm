# The Solar Maintenance Guys — CRM

Internal CRM and sales platform. Phase 1A (foundation) is implemented. See `SETUP.md` for first-run instructions.

## Stack

- **Framework:** Next.js 16 (App Router) + TypeScript + Tailwind v4
- **Database:** PostgreSQL via Prisma ORM
- **Auth:** NextAuth v5 (credentials) with role-based access control
- **UI:** Lightweight shadcn-style primitives, dark-mode-first, teal (#14B8A6) accent
- **CSV:** papaparse + server-side field mapping + duplicate review queue

## What's built (Phase 1A)

- Company CRUD, soft delete, Next Action, DNC flags
- Contact CRUD with per-contact DNC + unsubscribe tracking
- Deal CRUD (standing pricing agreements) with auto pricing-approval trigger under $150/panel
- CSV import: upload → column mapping → duplicate detection (phone / email / exact name) → review queue → finalize
- Append-only Audit Log with automatic hooks on role changes, DNC edits, reassignments, deal creation, CSV imports, settings changes
- Role-aware dashboards (Owner / Rep)
- Company list + pipeline/kanban view with filters
- User invitations with secure one-time tokens (automated email send arrives in Phase 1C)
- Global Settings admin + Standard Line Item Menu editing
- Dark / Light / System theme toggle, role-aware sidebar
- Feature stubs for Jobs / Campaigns / Reports so nav never 404s

## What's next (not in this build)

- Phase 1B: Jobs, Estimates (with versioning + "Maximize" quick-action + PDF), Commissions, Profit snapshots
- Phase 1C: Twilio calling/SMS, SendGrid email + campaigns, activity timeline auto-log from webhooks
- Phase 1D: Widget dashboard (react-grid-layout), notifications, dormant alerts, follow-up cadences
- Phase 1E: Map view, bulk actions, data export

## Scripts

```
pnpm dev         # start the dev server
pnpm build       # production build (runs prisma generate first)
pnpm db:migrate  # prisma migrate dev
pnpm db:push     # fast iterate without migration files
pnpm db:seed     # seed users + line item menu + defaults
pnpm db:studio   # open Prisma Studio
pnpm db:reset    # DESTRUCTIVE: drop + re-seed
```
