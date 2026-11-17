# Launch checklist (things only the founders can do)

Work through this top to bottom. Items marked **before real users** must be done before any teacher runs a real class.

## Before real users
- [ ] **Run `supabase/launch_readiness.sql`** in the Supabase SQL editor for the Pacer project. It adds AI rate limiting, anonymous usage metrics, the waitlist and the data-request table. Until it runs, the rate limiter works per server instance only and the waitlist/metrics/data-request forms quietly do nothing.
- [ ] **Rotate the Anthropic API key** (it was pasted into a chat earlier) and set a monthly spend limit on the Anthropic account.
- [ ] Read Anthropic's current rules for products that minors use, and confirm the commercial terms say API content is not used for training. Update the Privacy page if anything differs.
- [ ] Set `NEXT_PUBLIC_CONTACT_EMAIL` in Vercel to a real shared inbox (not a personal one). The privacy and terms pages show it automatically.
- [ ] Move to paid hosting: Vercel's free Hobby plan is for non-commercial use, and a free Supabase project can pause and has limited backups.
- [ ] Link the Vercel project to GitHub so merges to `main` deploy by themselves, and protect `main` so CI must pass.
- [ ] Have a lawyer review the Privacy page and Terms. They are drafts.
- [ ] Decide the name. "Pacer" is already used by the US federal court records system and others; search the USPTO database and consider a rename before spending on a logo or domain.

## Accounts and security (needs your Google setup)
- [ ] Create a Google OAuth client and enter it in Supabase Authentication, then set `NEXT_PUBLIC_AUTH_ENABLED=1`. Follow `AUTH_SETUP.md`.
- [ ] Apply the other SQL scripts in `supabase/` that match the features you turn on, then test with a teacher and two student accounts.
- [ ] Teacher-owned rooms and private realtime channels (the README lists this as open work). Do this before any class with more than a handful of students.

## Company basics
- [ ] Form an LLC. Sign a founder agreement with vesting and IP assignment. Check the hackathon rules and any school IP policy.
- [ ] Open a business bank account when the first customer pays.

## Optional environment variables for the AI limits
`AI_LIMIT_PER_MINUTE` (default 20 per device), `AI_LIMIT_PER_DAY` (default 400 per device), `AI_GLOBAL_DAILY_CAP` (default 6000 AI calls per day across everyone). Lower the global cap while you are testing.

## Reading your numbers
After the SQL has run, in the Supabase SQL editor: `select * from usage_daily;` and `select email, role, note from waitlist order by created_at desc;`
