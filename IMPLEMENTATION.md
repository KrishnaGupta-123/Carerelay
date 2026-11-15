# CareRelay implementation checklist

- [ ] Next.js, TypeScript, Tailwind and accessible shadcn-style primitives
- [ ] Relational PostgreSQL migrations, profile isolation and role policies
- [ ] Supabase Auth, secure invitations and individual local development logins
- [ ] Accessible dashboard, medication CRUD, dose generation and status history
- [ ] Appointment calendar, assignments and follow-up notes
- [ ] Transactional handoffs, optimistic concurrency and audit trail
- [ ] Medication versions with reasons and instruction sources
- [ ] Persistent Resend outbox, reminders, escalation and deduplication
- [ ] Fictional seed, empty states, settings and responsive layouts
- [ ] Business logic and RLS tests, essential browser workflows
- [ ] Lint, typecheck, production build and deployment documentation

Production uses Supabase Auth and PostgreSQL. Local mode is explicitly development-only, with embedded PostgreSQL and real password authentication; no shared PIN or authentication bypass. Original research and presentation files are preserved.
