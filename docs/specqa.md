# Spec Q&A — Senior Developer Answers

**Context:** This is a personal-use app. Single user, browser on laptop + phone. **Stack: Supabase (free tier) + Cloudflare Pages (free tier).** Supabase provides Postgres, auth, row-level security, and edge functions. Cloudflare Pages hosts the SPA with global CDN. This gives us a real backend, cross-device access, and auth at zero cost — while keeping the architecture simple enough for a single-developer personal project.

---

## Scope & Platform

### 1. What is the MVP boundary for v1.0?

**Ship in v1:** Supabase project setup (Auth, RLS, schema), Modules 1 (Outcomes & Outputs) and 2 (Feedback Loop Engine — action logging, basic metrics, reflection prompts). Plus a minimal weekly review view from Module 3 (the completion grid). Auth and RLS are effectively free to add with Supabase and should be wired in from the start — retrofitting RLS later is painful.

**Defer to v1.1+:** Hypothesis testing, plateau detection, feedback cycle counter/milestones, learning analytics, dynamic context-aware prompts. These are powerful but you need a few weeks of real data before they become meaningful anyway. Build them once you're actually using the app and know what you want to see.

### 2. Must iOS, Android, and web ship together?

**No. Ship web only.** You said browser on laptop or phone — a responsive single-page app covers both. No native apps, no app stores, no build pipelines for three platforms. Deploy to **Cloudflare Pages** (free tier, global CDN, unlimited bandwidth, 500 builds/month). Use a PWA manifest so you can "Add to Home Screen" on your phone and get an app-like experience for free. Revisit native only if you hit a browser limitation that actually blocks you (you almost certainly won't).

### 3. Are metrics/hypothesis features in MVP?

**Metrics yes (simple version), hypothesis no.** Basic metric tracking (add a number, see a line chart) is trivial to build and immediately useful for health/fitness outcomes. Hypothesis testing with verdicts is a v1.1 feature — it needs enough data history to be meaningful and the verdict algorithm needs iteration once you see real data patterns.

### 4. What auth model is expected?

**Magic link via Supabase Auth.** Supabase gives you auth for free — take it. Magic link (passwordless email) is the simplest option: no password to remember, no OAuth provider setup, and it gates your data behind your email address. This also unlocks **cross-device access** for free: log outputs on your phone at the gym, do your weekly review on your laptop. Wire up Supabase's `@supabase/auth-helpers` and you're done in under an hour. Enable Supabase Row Level Security (RLS) on every table with a simple `auth.uid() = user_id` policy — this makes it impossible for any future bug to leak data, even though you're the only user.

### 5. Should timezone, locale, and "start of week" be user-configurable?

**Start of week: yes** — this directly affects the weekly review and "X times per week" logic, and you'll have a strong opinion about whether your week starts Monday or Sunday. **Timezone and locale: no, just use the browser's.** `Intl.DateTimeFormat().resolvedOptions()` gives you both for free. Don't build settings UI for things the browser already knows. Store all timestamps in Postgres as **UTC** (`timestamptz`) and convert to local time on the client — Supabase handles this cleanly.

---

## Data Model — Outcomes & Outputs

### 6. Exact status states for outcomes?

Keep it simple. **Three states: active, archived, retired.**

- `active` → `archived` (put it on ice, hide from daily view)
- `archived` → `active` (bring it back — this covers "reactivated")
- `active` → `retired` (done with this, permanent)
- `retired` → `active` (allow un-retiring, people change their minds)

Don't model "reactivated" as a separate state. It's just `archived → active`. Track the transition timestamps in a log if you want history.

### 7. Exact status states for outputs?

**Three states: active, paused, retired.**

- `active` → `paused` (temporarily off, doesn't count against completion)
- `paused` → `active` (resume)
- `active` → `retired` (no longer doing this)
- `retired` → `active` (allow resurrection)

Paused outputs don't appear on the daily dashboard and don't affect streaks or completion rates.

### 8. Can one output belong to multiple outcomes?

**No. One output, one outcome.** If an action serves two outcomes, create two outputs. The data model stays clean, completion tracking stays unambiguous, and the weekly review rolls up cleanly. You'll never actually want the complexity of many-to-many here.

### 9. For X times/week, how are missed actions handled at week-end?

**Expire.** If you committed to 3x/week and did 2, the week closes at 2/3. No carry-over — it creates perverse incentives ("I'll just do 6 next week") and complicates the completion math. The weekly review is where you reflect on why and adjust. The missed output is data, not debt.

---

## Action Logging & Daily Dashboard

### 10. For partial completion, what data type?

**Fraction: completed/total, both integers.** For example, "2 of 3 sets" is stored as `{completed: 2, total: 3}`. This is more informative than a percentage and trivially converts to a percentage for display. The `total` defaults to whatever the output definition says, and `completed` is what the user enters.

### 11. When outputs are edited, should past logs preserve historical snapshots?

**Yes, but cheaply.** When an output's description or schedule changes, write a row to the `output_change_log` table in Postgres with the old values and a timestamp. Past action logs just reference the output ID — when rendering historical data, you can look up what the output said at that point via the change log. Don't snapshot every field on every log entry; that's overkill for a personal app.

### 12. Hard-delete or soft-delete only?

**Soft-delete via status states only — no `deleted_at` column.** The `archived`/`retired` statuses already serve as soft-delete. Adding a separate `deleted_at` column creates confusing overlap ("is it retired AND deleted?"). Hide `archived`/`retired` items from active views. If you ever want to permanently reclaim space, a "purge retired items" action in settings performs actual `DELETE` from Postgres — this is rare, intentional, and doesn't need its own soft-delete layer.

### 13. Is Starter Mode rule-based or AI-generated?

**Rule-based.** Simple deterministic heuristics: if the user's stated frequency is daily, suggest 3x/week instead. If the quantity is high, halve it. You can hardcode a few rules and they'll cover 90% of cases. You *could* use Supabase edge functions to call an LLM since you now have a backend, but it adds cost, latency, and a third-party dependency for something a few `if` statements handle fine. Save LLM integration for context-aware prompts in v1.1+ if you want it then.

### 14. Should starter suggestions appear only for the first output per outcome?

**First output per outcome only.** After that, assume the user knows what they're doing. Showing it repeatedly would feel patronizing. If you want, add a small "suggest easier version" button on the output creation form that's always available but never forced.

### 15. Do we need to track acceptance/rejection of starter suggestions?

**No.** This is analytics for product optimization in a multi-user SaaS. You're the only user. You'll know whether you're using it. Skip the tracking, save the schema complexity.

### 16. Should the daily dashboard show overdue/backlog items?

**Show today's scheduled items plus a subtle "missed yesterday" indicator if applicable.** Don't show a full backlog — that creates anxiety and guilt, which directly contradicts the "no guilt design" principle. A small badge like "1 missed yesterday" with a tap-to-log-retroactively option is plenty.

### 17. Can users log actions retroactively?

**Yes, within the current week.** You'll forget to log things, especially on weekends. Allow tapping into any day of the current week to mark completions. Don't allow retroactive logging further back than that — it undermines the integrity of the data and the weekly review becomes meaningless if you can rewrite history at will.

### 18. What is the exact streak definition?

**Per-output streak only.** A streak is consecutive scheduled occurrences completed. If an output is scheduled Mon/Wed/Fri and you complete Mon and Wed, your streak is 2 — Thursday doesn't break it because it wasn't scheduled. Global or per-outcome streaks are confusing aggregations. Keep it per-output, display it small, and don't over-emphasize it (streaks can become anxiety-inducing).

### 19. If an output is unscheduled for a day, does it impact streaks/completion?

**No.** Unscheduled days are invisible to the streak and completion calculations. Only scheduled occurrences count. For fixed-day outputs (e.g., Mon/Wed/Fri), non-selected days don't penalize. For flexible X/week outputs, streaks count consecutive weeks where the target was met rather than individual days.

### 20. Are notes plain text only? Length limit?

**Plain text only. Soft limit of 500 characters.** You don't need rich text for daily action notes. Store as Postgres `TEXT` (no hard limit at the DB level) but enforce 500 characters in the UI with a character counter. This keeps the notes focused and prevents the daily log from becoming a journaling app.

---

## Metrics & Data

### 21. Are metric values numeric-only? Decimals and custom units?

**Numeric only, decimals supported, custom unit labels.** Store as Postgres `NUMERIC` (arbitrary precision, avoids float rounding issues with body weight etc.). The unit is a display-only `TEXT` column the user types (e.g., "kg", "lbs", "%", "subscribers"). Don't build unit conversion logic — just store the number and the label. If you switch from lbs to kg, create a new metric.

### 22. Can metric entries be edited/deleted/backfilled?

**Yes to all three. No audit history needed.** You're the only user — there's nobody to audit. Allow editing past entries (you'll mistype numbers), deleting outliers (bad weigh-in after a huge meal), and backfilling gaps. Keep it simple.

### 23. If multiple metrics exist on one outcome, which drives plateau detection?

**User-designated "primary metric" per outcome.** When you add multiple metrics, one is flagged as primary. Plateau detection (when built in v1.1+) runs against that one. Default to the first metric created. Allow changing it in outcome settings.

### 24. Is the chart overlay purely visual, or should we compute correlation?

**Overlay is v1.1. Standalone metric charts ship in v1; visual overlay of output completion on metric charts ships in v1.1.** You need weeks of data before overlay patterns are visible, so there's no loss deferring it. When built, keep it visual only — computing correlation scores requires statistical rigor (sample size, confounders) that's hard to get right and easy to get misleadingly wrong. If you want correlation later, add a simple Pearson coefficient as a tooltip, clearly labeled as rough/indicative.

### 25. What exact rule defines "plateau"?

**Defer to v1.1, but the planned rule:** Primary metric's 14-day rolling average has changed by less than 1% compared to the prior 14-day rolling average, with a minimum of 21 data points total. This is simple, resistant to daily noise, and the 21-point minimum prevents false triggers early on. Tune these parameters once you have real data.

---

## Reflections & Prompts

### 26. Is weekly reflection mandatory, optional, or skippable?

**Optional with a gentle nudge.** Show the reflection prompt in the weekly review view. If the user skips it, don't nag — but show a small "you have an unreflected week" dot next time. Never block any workflow behind completing a reflection.

### 27. What intervals beyond weekly?

**Weekly only for v1.** Monthly reflection is a v1.1 addition — you need a month of data before it's useful, so building it at launch is premature. Biweekly is awkward to schedule (which week?), and custom intervals add UI complexity for marginal value. Weekly is the core loop and all you need to start. Add monthly and biweekly/custom only once you've been using the app and feel the need.

### 28. Are context-aware prompts required in v1?

**No.** Ship with the three default prompts. Context-aware prompts (referencing specific metric trends or missed outputs) are a v1.1 feature. When you build them, make them **rule-based** — simple conditionals like "if metric is flat for 2+ weeks, ask about changing approach." No LLM needed.

---

## Weekly Review

### 29. Are shortfall tags fixed or user-editable?

**Fixed taxonomy with an "other" free-text option.** Ship with: Time, Energy, Motivation, External Blocker, Forgot, Other. A fixed set enables pattern analysis in analytics ("you cite 'Energy' 60% of the time"). The "Other" field catches edge cases. Allow adding custom tags in a future version if the fixed set feels limiting.

### 30. Can a missed output have multiple shortfall reasons?

**One primary reason only.** Forcing a single tag makes the user prioritize ("what was the *main* reason?"), which produces cleaner data and more actionable patterns. Multi-select leads to tagging everything as "Time + Energy + Motivation," which tells you nothing.

---

## Hypotheses (v1.1+)

### 31. Can multiple hypotheses be active per outcome?

**Yes, but limit to 3 active simultaneously.** You might test different aspects of the same outcome. More than 3 gets confusing and likely means you need to break the outcome into sub-outcomes.

### 32. What algorithm determines the verdict?

**Simple linear trend comparison.** Compare the metric's linear regression slope during the evaluation period against the hypothesis target rate. If the slope is ≥80% of the target rate → Supported. If 30–79% → Inconclusive. If <30% → Not Supported. These thresholds are arbitrary starting points — tune them after you see how they feel with real data. Clearly label verdicts as "rough assessment, not statistical proof."

### 33. Minimum data threshold before issuing a verdict?

**At least 7 data points within the evaluation period.** Fewer than that, and the trend is meaningless. If the user hasn't logged enough data, show "Not enough data — need X more entries" instead of a verdict.

### 34. Is verdict generation automatic or user-triggered?

**User-triggered with a prompt.** When the evaluation period ends, surface a "Review hypothesis" card in the weekly review. The user taps it, sees the data and trend, and the app shows its suggested verdict. The user can accept or override it. This keeps the user in the loop rather than having the app silently declare their hypothesis failed.

---

## Non-Functional Requirements

### 35. Should v1 support JSON, CSV, markdown, and PDF export?

**v1.1.** Your data lives in Supabase's Postgres and is backed up automatically (Supabase free tier includes daily backups with 7-day retention). JSON export is no longer a safety net — it's a convenience feature. Still worth building (it's a single Supabase RPC that selects all your data and serializes to JSON), but don't let it delay v1 launch. CSV, markdown, and PDF are all post-v1.1.

### 36. Offline sync conflict resolution?

**Last-write-wins, which is effectively a non-issue.** With Postgres as the single source of truth, every write goes straight to the server. There are no true sync conflicts because there's no local-first data store. The question becomes "what happens offline?" — and the answer for v1 is: **the app requires connectivity.** You're logging outputs on your phone or laptop, both almost always on WiFi or mobile data. If you briefly lose connection, show a toast ("Offline — changes will save when reconnected") and queue the write in memory. Don't build a full IndexedDB offline cache upfront — it's significant complexity for a scenario that will rarely occur. Revisit only if offline usage becomes a real friction point.

### 37. Is anonymized non-content telemetry allowed?

**No telemetry.** It's your personal app. You don't need analytics about your own usage. Supabase's built-in dashboard already shows you API request counts, database size, and auth activity if you're ever curious. Skip instrumenting anything in the app itself.

### 38. Do we need account/data deletion workflows?

**"Delete all app data" for v1 — defer account deletion to v1.1.** Build a Supabase RPC function that cascade-deletes all rows for the authenticated user across all app tables. Prompt "Export your data first?" before the confirmation dialog. The auth record persists (the app is simply empty), and full account deletion can be done manually via the Supabase dashboard if ever needed. A proper edge function for `supabase.auth.admin.deleteUser()` is v1.1 — it requires a service role key and privileged infrastructure that isn't worth building for something you'll rarely use.

### 39. Performance target — what baseline?

**<1s on a 3-year-old phone over WiFi with 6 months of data.** The bottleneck shifts from local reads to network round-trips. Supabase Postgres is fast, but you're adding ~50–200ms per query depending on geography. Two mitigations: **(1)** Fetch the entire daily dashboard in a **single Supabase RPC call** — one round-trip, not N queries per output. **(2)** Cloudflare Pages serves the static SPA assets from edge, so the shell loads near-instantly; only the data fetch adds latency. For 6 months of data (~180 log entries, ~25 metrics, ~25 reflections), a single Postgres query returns in well under 100ms. Total time-to-interactive should be ~300–500ms. Keep the JS bundle under 200KB gzipped to protect the static asset side.

### 40. Notification model?

**Two options, pick based on effort tolerance.** **(Option A — v1 simple):** Browser/PWA notifications only. One daily reminder, one weekly review nudge, both at user-configured times. These are **best-effort** — they only fire when the service worker is alive or the browser is open, and are unreliable on iOS when the app is fully closed. The settings UI should be transparent: "Reminders work best when the app is open or added to your home screen." **(Option B — v1.1 upgrade):** Use a **Supabase cron trigger + edge function** to send email reminders instead. This is the reliable path — no browser dependency, guaranteed delivery. Supabase's free tier includes 100K edge function invocations/month — one daily email is 30/month. Recommended: ship v1 with best-effort browser notifications, upgrade to email in v1.1. No quiet hours logic needed either way — the user sets the reminder time, implicitly choosing when to be notified.

---

## Summary: What v1 Actually Looks Like

A single-page web app deployed to **Cloudflare Pages**, backed by **Supabase** (Postgres + Auth + RLS). Zero monthly cost. Cross-device access from day one via magic link auth.

**Locked Stack:**
- **Frontend:** React + TypeScript + Vite, PWA manifest, deployed to Cloudflare Pages
- **Backend:** Supabase free tier (Postgres, Auth, RLS, edge functions)
- **Auth:** Magic link (passwordless email) via Supabase Auth, sign-ups disabled, single allowlisted email
- **Data:** All tables include `user_id`, protected by RLS (`auth.uid() = user_id`)

**v1 ships with:**
- Supabase Auth (magic link, sign-ups disabled) + RLS on all tables
- Outcome CRUD (active/archived/retired)
- Output CRUD with frequency scheduling (daily, flexible X/week, fixed days/week)
- Starter mode (rule-based, first output only)
- Daily dashboard with completion logging, partial completion, and notes
- Basic numeric metrics with standalone line charts
- Weekly review grid (mixed layout: day-cells for fixed, summary cell for flexible)
- Shortfall tagging (fixed taxonomy, per-occurrence for fixed/daily, per-week for flexible)
- Weekly reflection prompts (3 defaults, one JSONB row per outcome per week)
- Browser/PWA notifications (best-effort)
- Start-of-week setting
- Data deletion via RPC (app data only, not auth account)

**v1.1 adds:**
- JSON export/import
- Hypothesis testing with simple verdicts
- Feedback cycle counter and milestones
- Plateau detection
- Context-aware reflection prompts (rule-based)
- Monthly reflection cadence
- Chart overlay (metrics + output completion)
- Email reminders via Supabase edge functions + cron
- Account deletion edge function

**Deferred indefinitely:**
- Native mobile apps
- LLM-powered features
- PDF/CSV/markdown export
- Telemetry
- Offline-first architecture