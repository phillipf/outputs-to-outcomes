# Spec Q&A — Follow-Up Answers (Round 2)

**Context:** These answers resolve contradictions and open questions from the first Q&A pass. Where an answer changes the spec-qa.md, the canonical document has been updated to match.

---

## Versioning Contradictions (Q1–Q3)

### 1. Monthly reflection cadence: v1 or v1.1?

**v1.1.** The Q27 answer was wrong to include it in v1. Weekly is the core loop and all you need at launch. Monthly reflection only becomes useful after you have a month of data, so building it in week one is premature. The weekly review view already exists — monthly is just a second trigger on the same UI. Easy to add later, zero cost to defer.

**Resolution:** Q27 updated to "weekly only for v1," summary already correctly lists monthly in v1.1.

### 2. Chart overlay: v1 or v1.1?

**v1.1.** Q24 saying "visual only for v1" was misleading — it implied overlay ships in v1 but without correlation scores. The overlay itself is a v1.1 feature. In v1, metrics get their own standalone line chart. You don't need to see output completion overlaid on the metric chart until you have enough data to spot patterns, which takes weeks. Build standalone charts first, overlay second.

**Resolution:** Q24 updated to clarify overlay is v1.1; standalone metric charts are v1.

### 3. JSON export: v1 or v1.1?

**v1.1.** The Q35 answer said "nice to have in v1" but the summary listed it in v1.1. Go with v1.1. Supabase has automatic daily backups with 7-day retention — your data is already safe. JSON export is a convenience, not a safety net. Don't let it delay launch.

**Resolution:** Q35 updated to explicitly say v1.1. Summary already correct.

---

## Offline & Connectivity (Q4)

### 4. Are we replacing the offline requirement?

**Yes, officially.** The spec now states: v1 requires connectivity. If the device goes offline mid-session, queue pending writes in memory and retry on reconnect with a visible toast. No IndexedDB cache, no service worker sync, no offline-first architecture. This is a deliberate tradeoff — you get cross-device access and a real database at the cost of needing WiFi or mobile data, which you'll have 99%+ of the time.

---

## X/Week Scheduling (Q5–Q6)

### 5. Are X/week days fixed or flexible?

**Flexible.** The user says "3x/week" and can complete those 3 on any days they choose. Forcing fixed days (e.g., Mon/Wed/Fri) works for gym routines but breaks for things like "write 3 blog posts this week" where you do them whenever inspiration or time hits. Support both modes: "flexible X/week" (default) and "fixed days" (user explicitly selects weekdays). Store as `frequency_type: 'flexible_weekly' | 'fixed_weekly' | 'daily'`.

### 6. How does the daily dashboard handle flexible X/week outputs?

**Always show them, with a progress counter.** A flexible 3x/week output appears on the dashboard every day of the week with a label like "1 of 3 this week" (updating as completions are logged). The user taps to log whenever they do it. Once 3/3 is hit, the output shows as complete for the rest of the week but remains visible (greyed out, not hidden — the user should see their success). This avoids the impossible question of "is this scheduled today?" — with flexible outputs, every day is a valid day.

---

## Action Logging Details (Q7–Q8)

### 7. Multiple completions per output per date?

**One row per output per date, strictly.** If an output is "practice piano" and you practice morning and evening, that's still one completion for the day. The notes field can capture "did two sessions." Multiple rows per day complicates every query (aggregation, streaks, weekly grid) for no real gain. The partial completion field (`completed/total`) already handles volume within a single day (e.g., "2 of 3 sets").

### 8. Color rules for the weekly grid?

**Based on completion ratio:**

- **Green:** `completed/total >= 1.0` (fully done or exceeded)
- **Yellow:** `completed/total > 0 AND < 1.0` (partial — did something but not all)
- **Red:** No action log entry for that day, OR `completed/total = 0` (logged but did nothing)
- **Grey:** Output not scheduled for that day (no dot, or a neutral grey dot to fill the grid)

For flexible X/week outputs, the grid cells don't map to individual days. Instead, show a single weekly summary cell: green if target met (e.g., 3/3), yellow if partially met (1/3 or 2/3), red if 0.

---

## Shortfall Tagging (Q9–Q10)

### 9. Does the tag attach per occurrence or per output per week?

**Per missed occurrence.** If you miss Monday and Wednesday, those could be different reasons (Monday was "Energy," Wednesday was "External Blocker"). Tagging per occurrence gives you finer-grained data for pattern analysis. The weekly review UI shows all misses for the week — tagging each one is fast (one tap per miss).

### 10. Do shortfall tags apply to partial completions?

**Yes.** A partial completion means something prevented full completion — that's worth tagging. If you did 1 of 3 sets, the shortfall tag explains why you stopped. Show the tag prompt for both full misses (red) and partial completions (yellow). Don't show it for green.

---

## Data Model Clarifications (Q11–Q12)

### 11. Do we need both status states AND deleted_at?

**Remove `deleted_at`. Use status states only.** The overlap is real and confusing. Here's the clean model:

- **Outcomes:** `active | archived | retired` — no `deleted_at` column.
- **Outputs:** `active | paused | retired` — no `deleted_at` column.
- `archived`/`retired` items are hidden from the daily dashboard and active views.
- A "purge retired items" action in settings performs actual `DELETE` from Postgres for users who want to reclaim space. This is rare and intentional, so it doesn't need soft-delete protection.

This eliminates the question of "is it retired AND deleted?" which has no good answer.

### 12. RLS: user_id on every table, or join-based from parents?

**`user_id` on every table.** Direct column policies are simpler, faster, and easier to reason about than join-based RLS in Supabase. The storage overhead is one UUID per row — negligible. Every table gets:

```sql
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_owns_row" ON table_name
  FOR ALL USING (auth.uid() = user_id);
```

Join-based policies (e.g., "action_log is owned by the user who owns the output that owns the outcome") require subqueries in the policy definition, which are slower and harder to debug. For a personal app with one user, the performance difference is zero, but the simplicity difference is significant during development.

---

## Auth & Framework (Q13–Q14)

### 13. Should auth be restricted to one allowlisted email?

**Yes. Restrict to your email only.** Supabase lets you disable public sign-ups in the Auth settings (Dashboard → Authentication → Settings → toggle off "Enable sign-ups"). Then manually create your account via the Supabase dashboard or a one-time setup script. This means no one else can create an account even if they find your app's URL. Combined with RLS, this is belt-and-suspenders security for zero effort.

### 14. Should we lock the frontend framework now?

**Yes. Pick React.** Reasons:

- **Supabase ecosystem fit:** `@supabase/auth-helpers-react`, `@supabase/ssr`, and all Supabase tutorials assume React. You'll copy-paste setup code directly instead of translating.
- **Library availability:** Charting (Recharts), date handling, UI components — React has the deepest ecosystem by far.
- **AI coding assistance:** Every LLM has more React training data than Svelte. If you're using Claude or Copilot to help build this, React gives better results.
- **PWA tooling:** Vite + React + vite-plugin-pwa is a well-trodden path with minimal config.

Svelte is a great framework, but for a solo personal project where speed-to-launch matters and the ecosystem fit with Supabase is a real factor, React is the pragmatic choice. Use **Vite** as the bundler (not Create React App, which is dead). TypeScript from day one — the Supabase client is fully typed and it'll save you debugging time.

**Locked stack:** React + TypeScript + Vite + Supabase JS client, deployed to Cloudflare Pages.

---

## Round 3 — Implementation Details

### 15. For flexible X/week, how does shortfall tagging work?

**One tag per output per week, covering the overall deficit.** Flexible outputs don't have missed *occurrences* — there's no specific day you failed to show up. During the weekly review, if you did 1 of 3, you tag one reason for the deficit ("Why didn't you hit 3 this week?"). Creating phantom misses to tag individually would be artificial.

This means shortfall tagging has **two modes:**
- **Fixed-day / daily outputs:** tag per missed occurrence (e.g., missed Monday → tag Monday)
- **Flexible X/week outputs:** tag once per output per week if target not met

The weekly review UI handles both naturally since it already shows per-output summaries.

### 16. Can `completed` exceed 1 per day for flexible outputs?

**Yes.** If the output is "write 3 blog posts this week" and you write 2 on Saturday, that day's row stores `{completed: 2, total: 3}` — counting 2 toward the weekly target. Cap `completed` at the remaining weekly balance: if you've done 1 earlier in the week, Saturday shows `{completed: 2, total: 2}` (2 remaining).

The weekly aggregation sums `completed` across all daily rows for flexible outputs. For daily and fixed-day outputs, `completed/total` represents partial units within a single occurrence (e.g., 2 of 3 sets), and `completed` will not exceed `total`. The `frequency_type` column tells you how to interpret the values — worth a code comment but no schema difference.

### 17. Weekly review grid: mixed layout for fixed vs flexible?

**Yes — mixed layout, kept simple.**

- **Fixed-day / daily outputs:** 7 day-cells (Mon–Sun), colored per occurrence (green/yellow/red/grey).
- **Flexible X/week outputs:** Single summary cell spanning the row, colored by weekly target (green ≥ target, yellow > 0 but under, red = 0).

Don't fake day-cells for flexible outputs — it visually implies commitments that don't exist. The mixed layout is intuitive: rows with dots across the week are routine habits, rows with a single wide cell are "get it done whenever" outputs.

### 18. Browser/PWA notifications: what guarantee level?

**Best-effort, and be transparent about it.** Browser/PWA notifications only fire when the service worker is alive or the browser is open. On iOS especially, notifications are unreliable when the app is fully closed. The settings UI should say something like "Reminders work best when the app is open or added to your home screen." Don't promise delivery.

This is a known v1 limitation and the explicit reason email reminders via Supabase edge functions + cron are planned for v1.1 — that's the reliable path.

### 19. Should v1 include edge function for account deletion?

**No. "Delete all app data" is sufficient for v1.** The `supabase.auth.admin.deleteUser()` call requires a service role key, meaning an edge function with privileged access — meaningful infrastructure for something you'll likely never use. For v1, build a Supabase RPC that cascade-deletes all rows for `auth.uid()` across app tables. The auth record persists, but the app is empty. Full account deletion (including auth record) can be done manually from the Supabase dashboard, or via an edge function in v1.1 if it bothers you.

### 20. Reflection storage: one row per period with JSONB responses.

**One row per reflection period per outcome.** Store prompt responses in a `responses JSONB` column:

```json
{
  "what_worked": "Morning sessions were more focused...",
  "what_didnt": "Skipped Wednesday entirely...",
  "what_to_change": "Move piano practice before dinner..."
}
```

Schema:

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| user_id | UUID | RLS policy |
| outcome_id | UUID | FK to outcomes |
| period_type | TEXT | `'weekly'` (v1), `'monthly'` (v1.1) |
| period_start | DATE | Start of the week/month |
| responses | JSONB | Prompt answers keyed by prompt slug |
| created_at | TIMESTAMPTZ | When reflection was submitted |

One row per outcome per week keeps queries simple, makes the learning journal view trivial (list rows), and the JSONB column is flexible enough to add/change prompts without a schema migration. The trade-off is you can't query individual prompt answers with simple SQL — but you'll never need to, since reflections are always rendered as a full unit.