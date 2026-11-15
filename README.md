# CareRelay

> **Shared care, made simpler.**  
> A collaborative elderly-care platform for medication routines, caregiver coordination, care handoffs, and doctor appointments.

<p align="center">
  <a href="https://carerelay-omega.vercel.app/">Live application</a> ·
  <a href="https://github.com/KrishnaGupta-123/Carerelay">GitHub repository</a>
</p>

CareRelay is designed to help an older person and their trusted care circle coordinate day-to-day care in one shared space. It brings together care profiles, medication schedules and dose records, appointments, caregiver responsibilities, handoffs, and an activity history.

> **Hackathon:** CATALYST – Solo AI Hackathon, organised by Makers Need More (MnM) in collaboration with PromptWars  
> **Chosen vertical:** Elderly Care & Medication Management

---

## Table of contents

- [1. Problem statement](#1-problem-statement)
- [2. Chosen vertical](#2-chosen-vertical)
- [3. Our approach and logic](#3-our-approach-and-logic)
- [4. How CareRelay works](#4-how-carerelay-works)
- [5. Core capabilities](#5-core-capabilities)
- [6. Roles and access model](#6-roles-and-access-model)
- [7. System architecture](#7-system-architecture)
- [8. Data model](#8-data-model)
- [9. Technology stack](#9-technology-stack)
- [10. Assumptions and design decisions](#10-assumptions-and-design-decisions)
- [11. Local setup](#11-local-setup)
- [12. Environment variables](#12-environment-variables)
- [13. Database migrations and demo data](#13-database-migrations-and-demo-data)
- [14. Testing and quality checks](#14-testing-and-quality-checks)
- [15. Deployment](#15-deployment)
- [16. Screenshots](#16-screenshots)
- [17. Limitations and future work](#17-limitations-and-future-work)
- [18. Safety and privacy](#18-safety-and-privacy)

## 1. Problem statement

Elderly care is often shared among family members, coordinators, and caregivers. Important information can become fragmented across conversations, notes, calendars, and individual memory. This makes it harder for everyone involved to understand:

- Which medication routines have been recorded and when doses are scheduled.
- Whether a dose was reported as taken, declined, unconfirmed, or missed.
- Who is responsible for helping with a particular task or appointment.
- Whether a care responsibility has been offered, accepted, declined, or completed.
- What has changed and who recorded that change.

CareRelay addresses this coordination problem by organising care information around an older person's care profile and the people authorised to support it.

## 2. Chosen vertical

**Elderly Care & Medication Management**

CareRelay sits within the digital-health and elderly-care coordination vertical. Its focus is not medical diagnosis or treatment recommendations. It is the organisation of care information and the coordination of responsibilities among an older person and their authorised care circle.

The older person remains central to the care profile. Other participants receive access through defined roles rather than through an unrestricted shared account.

## 3. Our approach and logic

CareRelay follows a **shared care-profile model**. Instead of treating medication reminders, appointments, and caregiver tasks as disconnected features, it associates them with a care profile and its authorised members.

### 3.1 Organise information around a care profile

A care profile stores the information needed to coordinate support, including a preferred name, time zone, notes, and reminder preferences. A user who creates a profile becomes its owner and can invite other participants with defined roles.

### 3.2 Record medication instructions with context

Medication records include details such as the name, strength, dosage, form, route, instructions, source, start and end dates, schedule, and responsible care-circle member. Changes can retain a version snapshot and record the reason and source for the change. This provides context instead of silently replacing a previous instruction.

### 3.3 Treat a dose as an event with a status

A scheduled dose is represented as a dose event with its scheduled time and a snapshot of the medication details at that point. The status model distinguishes between:

- `scheduled`
- `self_reported_taken`
- `assisted_recorded`
- `declined`
- `needs_help`
- `unconfirmed`
- `explicitly_missed`

This distinction matters: an unconfirmed dose is not automatically treated as a missed dose. The record captures what was reported; it does not independently prove that a medication was taken.

### 3.4 Make care responsibilities explicit

Assignments can be associated with a dose event or an appointment. They record the current, previous, or proposed owner, a due time, notes, and a status such as open, pending, accepted, declined, or completed. This makes handoffs visible and gives the care circle a record of responsibility changes.

### 3.5 Preserve an activity history

Important actions are recorded in an audit history with the actor, action, entity, details, and timestamp. This helps authorised members understand what changed and when.

### 3.6 Deliver notifications through a controlled path

The database includes a notification/outbox model with delivery states, attempt tracking, and an idempotency key. Email delivery uses the Resend integration when configured. Actual delivery depends on the deployed worker/cron configuration and valid sender-domain setup; adding an API key alone should not be treated as proof that reminders are reaching recipients.

## 4. How CareRelay works

A typical workflow is:

1. **Create an account and care profile.** The profile owner enters the older person's preferred name, time zone, and optional care preferences.
2. **Invite the care circle.** The owner invites people as coordinators, caretakers, or viewers. Invitations are time-limited and single-use in the database workflow.
3. **Record medication information.** An authorised participant records medication details, schedule, source/instructions, and the member responsible for support.
4. **Review dose events.** Scheduled dose events can be updated with a status and an optional note. The status describes the report recorded in the system.
5. **Coordinate a handoff.** A member can assign a task related to a dose or appointment to another care-circle member. The recipient can respond, and the assignment status records the handoff state.
6. **Manage appointments.** Appointment records can include the clinician, specialty, date/time, clinic/location, accompanying member, status, and follow-up notes.
7. **Review notifications and activity.** Members can review relevant notifications and the history of recorded care actions, according to their access.

The application uses the care profile's time zone for time-sensitive care information. This avoids assuming that every participant or server operates in the same time zone.

## 5. Core capabilities

The repository's data model and application actions cover these areas:

| Area | What it supports |
|---|---|
| Care profiles | Preferred name, date of birth (optional), time zone, care notes, and reminder preferences |
| Care-circle membership | Owner, coordinator, caretaker, and viewer roles; invitations and membership status |
| Medication records | Medication details, instructions/source, active/paused/completed state, schedule, and responsible member |
| Dose history | Scheduled events and distinct reported statuses, including assisted, declined, unconfirmed, and explicitly missed |
| Medication history | Version snapshots, change reason, source, and actor |
| Appointments | Clinician and clinic details, scheduled time, accompanying member, status, and follow-up notes |
| Care assignments | Responsibility handoffs linked to a dose event or appointment, with acceptance and completion states |
| Notifications | Queued/processing/sent/failed/unconfigured states, attempts, read state, and deduplication key |
| Audit history | Actor, action, affected entity, details, and timestamp |

The live application is the source of truth for which screens and workflows are currently available in the deployed build. The table above describes the supported domain model and repository workflow; it is not a claim that every optional integration is configured in every environment.

## 6. Roles and access model

CareRelay defines four care-circle roles:

| Role | Intended responsibility |
|---|---|
| **Owner** | Creates and owns the care profile and manages the care circle. |
| **Coordinator** | Helps organise care information and coordinate responsibilities. |
| **Caretaker** | Supports assigned care tasks and relevant medication or appointment workflows. |
| **Viewer** | Has read-oriented access to the information permitted for the care profile. |

Permissions are enforced in the database layer as well as in the application. The migrations enable Row Level Security (RLS) on public tables. Application mutations use permission-checked database functions rather than relying on client-side controls alone. Access to records is scoped to the relevant care profile and member role.

## 7. System architecture

CareRelay uses a Next.js application with server-side authentication and application logic. In the hosted environment, Supabase provides authentication and PostgreSQL storage. Database migrations define the tables, access policies, and application functions. Resend is used for transactional email when configured.

```mermaid
flowchart TD
    U[Older person / care-circle member] --> WEB[Next.js App Router<br/>React + TypeScript]
    WEB --> AUTH[Server-side authentication<br/>and session checks]
    WEB --> LOGIC[Validated application actions]
    AUTH --> SA[Supabase Auth]
    LOGIC --> RPC[Permission-checked PostgreSQL RPCs]
    RPC --> DB[(Supabase PostgreSQL)]
    DB --> RLS[Row Level Security<br/>profile and role boundaries]
    RPC --> OUTBOX[Notification outbox]
    OUTBOX --> WORKER[Configured worker / scheduled processing]
    WORKER --> RESEND[Resend email API<br/>(optional configuration)]

    DEV[Local development mode] -. development only .-> PGLITE[(Embedded PGlite database)]
    WEB -. local-only fallback .-> DEV
```

### Hosted and local modes

- **Hosted/production:** Uses Supabase Auth and Supabase PostgreSQL. Configure the Supabase project URL and publishable key. Administrative keys are server-side only and are not browser credentials.
- **Local development:** The repository includes an embedded PostgreSQL-compatible PGlite mode for local development and isolated test runs. This mode is explicitly development-only and is guarded so it is not enabled in production.
- **Email:** Resend is optional at setup time. Email delivery requires the API key, an appropriate sender identity/domain, and the worker or scheduled processing configuration used by the deployment.

## 8. Data model

The Supabase migrations define relational tables for the core care domain, including:

- `users` and `elderly_profiles`
- `care_members` and `invitations`
- `medications`, `medication_schedules`, and `medication_versions`
- `dose_events`
- `appointments` and `care_assignments`
- `notifications` and `audit_logs`
- supporting rate-limit and job-setting tables

Foreign keys and constraints connect records to their care profile. The schema also uses version fields for change-sensitive records and uniqueness constraints for selected relationships and notification idempotency.

### Database security approach

The migrations enable RLS on the public application tables. Read policies are based on the authenticated user’s membership and role. The migration intentionally avoids general direct-write policies for application tables; mutations are performed through database functions that validate the caller's identity and permissions and apply transactional updates.

Review the SQL migrations in [`supabase/migrations/`](supabase/migrations/) for the complete schema and policy definitions.

## 9. Technology stack

| Layer | Technologies |
|---|---|
| Application framework | Next.js 16, React 19 |
| Language | TypeScript 5.9 |
| Styling and UI | Tailwind CSS 4, Radix UI primitives, Lucide icons |
| Authentication | Supabase Auth, `@supabase/ssr`, Supabase JavaScript client |
| Hosted database | Supabase PostgreSQL |
| Local development database | PGlite |
| Database access | PostgreSQL client and secured database RPC functions |
| Validation | Zod |
| Date and time handling | `date-fns`, `date-fns-tz` |
| Notifications/email | Resend, with database-backed notification/outbox records |
| Unit/business-logic testing | Vitest |
| Browser/E2E testing | Playwright, axe-core for Playwright |
| Code quality | ESLint, Prettier, TypeScript checks |
| Hosting | Vercel |

## 10. Assumptions and design decisions

The solution is based on the following assumptions:

1. **A care profile is created by an authorised person.** The profile owner is responsible for inviting the people who should participate in that care circle.
2. **Care-circle access is role-based.** Not every member needs the same ability to view, change, or coordinate care information.
3. **Medication information comes from a trusted human-provided source.** CareRelay records the medication details and their source; it does not decide what medication a person should take or change a prescribed dosage.
4. **A recorded status is not clinical proof.** A dose marked as self-reported or assisted-recorded represents information entered by a user. `unconfirmed` and `explicitly_missed` remain distinct states.
5. **Time zones matter.** Medication schedules, reminders, and appointments should be interpreted using the care profile's configured time zone.
6. **A handoff requires an explicit responsibility state.** Assigning a task and accepting/completing it are separate actions.
7. **Email is an external dependency.** Notification records can exist independently of successful delivery; delivery requires correct Resend and worker/cron configuration.
8. **Demonstration information is fictional.** Seed data is intended for demonstration and testing, not as a representation of a real person's health record.
9. **CareRelay supports coordination, not clinical decision-making.** Medical decisions remain with the individual and their qualified healthcare professionals.

## 11. Local setup

### Prerequisites

- Node.js compatible with the Next.js version in `package.json`.
- npm.
- Git.

### Clone and install

```bash
git clone https://github.com/KrishnaGupta-123/Carerelay.git
cd Carerelay
npm ci
```

### Configure local development

Create a local environment file:

```bash
cp .env.example .env.local
```

For a local-only development run, ensure the following is set in `.env.local`:

```env
LOCAL_DEVELOPMENT_MODE=true
LOCAL_DATABASE_PATH=.data/postgres
```

Do not set `NODE_ENV=production` for this local mode. When no hosted Supabase URL is configured, the app can use the embedded PGlite database and local password/session authentication. Local mode is not a production deployment option.

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The root route sends an authenticated user to the dashboard and an unauthenticated user to the login page.

### Connect a Supabase project

For hosted-backend development, configure the Supabase variables in `.env.local` instead of relying on the local-only fallback:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Use a publishable key (or the legacy anon key supported by the app) for the public client configuration. Never put a Supabase service-role key in a `NEXT_PUBLIC_` variable or browser code.

## 12. Environment variables

The authoritative variable list is [`.env.example`](.env.example). The following table explains its purpose:

| Variable | Purpose | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Required for hosted Supabase mode |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public Supabase publishable key | Preferred public client key |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Legacy public anon key | Alternative if using a legacy project key |
| `NEXT_PUBLIC_APP_URL` | Application origin for auth redirects | Must match the deployed/local URL and Supabase redirect configuration |
| `SUPABASE_SERVICE_ROLE_KEY` | Privileged Supabase admin access for hosted demo seeding | Seed-script use only; server-side secret, never expose to the browser |
| `DATABASE_URL` | Direct PostgreSQL connection for CLI migrations/seeding | Optional; use a suitable Supabase connection string |
| `RESEND_API_KEY` | Resend API authentication | Required only when sending email through Resend |
| `EMAIL_FROM` | Sender identity for transactional email | Production use requires a verified sending domain |
| `CRON_SECRET` | Secret for authenticated scheduled/worker operations | Keep private; use a strong random value |
| `LOCAL_DEVELOPMENT_MODE` | Enables local-only development fallback | Must not be used to enable local mode in production |
| `LOCAL_DATABASE_PATH` | Local PGlite data directory | Defaults to `.data/postgres` in the example |
| `DEMO_PASSWORD` | Password used by the fictional seed accounts | Required for hosted seeding; at least 12 characters; do not commit it |
| `REMINDER_LOOKAHEAD_DAYS` | Reminder look-ahead window | Optional tuning value |
| `NOTIFICATION_BATCH_SIZE` | Notification processing batch size | Optional tuning value |

Keep `.env.local` out of Git. The repository includes a verification script that checks staged files for environment artifacts and selected secret patterns; this is a guardrail, not a substitute for secret management or secret scanning.

## 13. Database migrations and demo data

### Apply migrations

The SQL migrations are stored in `supabase/migrations/`. Apply them to the intended Supabase project using the Supabase SQL Editor or the repository's migration script:

```bash
npm run db:migrate
```

The CLI migration path uses `DATABASE_URL`. Confirm the target project and review the migration files before executing them against a database containing existing data.

### Seed fictional demonstration data

The repository includes a demo seed scenario with four fictional care-circle participants:

| Demo identity | Role |
|---|---|
| Meera Sharma | Owner |
| Ananya Sharma | Coordinator |
| Arjun Sharma | Caretaker |
| Priya Sharma | Viewer |

The scenario creates a fictional care profile, sample medication records, dose reports, medication instruction history, care handoffs, and appointment-related data. It uses the same authenticated care actions as the application.

For local development, the seed script supports a local mode:

```bash
npm run db:seed -- --local
```

For a hosted Supabase project, hosted seeding requires `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and a `DEMO_PASSWORD` of at least 12 characters:

```bash
npm run db:seed
```

**Important:** Hosted seeding creates Auth users and inserts synthetic data into the configured Supabase project. Run it only in the intended demo project after reviewing the script. The same `DEMO_PASSWORD` is used for the fictional seed accounts. Do not commit or publish that password. The script checks for existing fictional accounts and stops rather than overwriting them. The seed script does not send emails.

To configure the background/notification worker, inspect the deployment requirements and run the setup script only after the required secrets and scheduling mechanism have been configured:

```bash
npm run db:worker
```

## 14. Testing and quality checks

The repository includes Vitest for unit/business-logic tests and Playwright for browser end-to-end tests. Playwright is configured to use a separate local test database and to capture screenshots/traces when tests fail. The E2E configuration disables Resend so automated tests do not send real email.

Run the available checks:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run build
npm run verify:repo
```

| Command | Purpose |
|---|---|
| `npm run format:check` | Check formatting with Prettier |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run the TypeScript compiler without emitting files |
| `npm run test` | Run the Vitest suite |
| `npm run test:e2e` | Run Playwright browser tests |
| `npm run build` | Create a production Next.js build |
| `npm run verify:repo` | Check staged files for selected secrets and generated artifacts |

These commands describe the available verification workflow; their presence in `package.json` does not imply that they have passed in every environment. Run them against the current commit and report the actual results before claiming a release is verified.

## 15. Deployment

The project is connected to Vercel for hosting. The repository's Vercel deployment is:

**Live application:** https://carerelay-omega.vercel.app/

For a Vercel deployment:

1. Import the GitHub repository into Vercel.
2. Set the project root to the repository root (`./`) and select the Next.js preset.
3. Add the required environment variables in the Vercel project settings for the appropriate environments.
4. Ensure Supabase Auth's allowed redirect URLs include the deployed application origin.
5. Apply the reviewed database migrations to the correct Supabase project.
6. Configure Resend and the notification worker/scheduler only if email delivery is required.
7. Deploy and test authentication, core care workflows, database access, and production logs.

A successful Vercel build alone does not prove that the database migrations, authentication redirects, or email delivery are configured correctly.

## 16. Screenshots

Screenshots should be captured from the running application and stored in `docs/images/`. Add genuine screenshots for the current implementation, such as:

- Landing/login screen
- Care dashboard
- Care profile and care-circle members
- Medication schedule and dose history
- Appointment management
- Care handoff/assignment flow
- Notification or activity history

<!--
After capturing the current application screens, add them here using relative paths, for example:

![CareRelay dashboard](docs/images/dashboard.png)

Do not add mockups or screenshots of features that are not present in the deployed application.
-->

## 17. Limitations and future work

The following areas should be validated and improved as the project evolves:

- Verify notification delivery end to end in the deployed environment, including worker/cron execution, sender-domain verification, retries, and failure visibility.
- Continue testing invitation expiry, role boundaries, and cross-profile data isolation.
- Expand edge-case testing for time zones, daylight-saving changes, schedule edits, and concurrent updates.
- Validate the experience with older adults and caregivers, including usability and accessibility testing with assistive technology.
- Document operational monitoring, backup/restore, and incident-response procedures before any real-world use.
- Keep the README feature descriptions and implementation checklist aligned with the current deployed build.

## 18. Safety and privacy

CareRelay is a care-coordination and record-keeping aid. It does not diagnose conditions, prescribe medication, recommend dosage changes, or replace professional medical advice. Medication details should be entered and reviewed against the appropriate clinician-provided instructions. Users should contact a qualified healthcare professional for medical decisions or urgent concerns.

Use synthetic data for demos and testing. Do not store real patient information in a public demonstration environment. Keep service-role keys, database connection strings, Resend keys, cron secrets, and demo passwords private. Apply least-privilege access and review the RLS policies before using the application with sensitive information.

---

**Built for CATALYST – Solo AI Hackathon.**  
For questions, issues, or feedback, please open an issue in the [GitHub repository](https://github.com/KrishnaGupta-123/Carerelay).
