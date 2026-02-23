# Outputs To Outcomes

Personal-use Outcome & Output Framework app.

## Stack

- Frontend: React + TypeScript + Vite
- Hosting: Cloudflare Pages
- Backend: Supabase (Postgres, Auth, RLS, RPC)
- Auth: Supabase magic link (allowlisted single email)

## Milestone Status

- M0 Foundation: completed
- M1 Data model + RLS: completed
- M2 Auth + route protection: completed
- M3 Outcomes + outputs CRUD: completed
- M4 Daily dashboard logging: completed
- M5 Weekly review + reflections: completed
- M6 Metrics + charts: completed
- M7 Settings + reminders + data purge: completed
- M8 Skills mastery layer: completed
- M9 Tests/performance hardening: completed

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create env file:

```bash
cp .env.example .env.local
```

3. Fill `.env.local` with your Supabase project values.

4. Run dev server:

```bash
npm run dev
```

5. Run tests:

```bash
npm run test:run
```

## Supabase Migration

Initial schema lives in:

- `supabase/migrations/20260223130000_init_schema.sql`
- `supabase/migrations/20260223143000_skill_mastery_layer.sql`

Apply with Supabase CLI (example):

```bash
supabase db push
```

## Cloudflare Pages

- SPA fallback is configured via `public/_redirects`.
- Build output directory is `dist`.
- `wrangler.toml` includes Pages output metadata for Wrangler-based deploys.

## Notes

- v1 notifications are browser/PWA best-effort only.
- v1 requires network connectivity (no offline-first cache).
- Account deletion edge function is deferred to v1.1.
