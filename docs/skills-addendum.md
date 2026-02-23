# Spec Addendum: Skill Mastery Layer

**Extends:** Outcome & Output Framework App — Functional Specification v1.0  
**Date:** February 23, 2026  
**Status:** Draft

---

## 1. The Problem

The current app tracks **consistency** ("did I practice?") but not **mastery** ("what am I actually getting better at?"). A user with an outcome like "learn guitar" and a daily output of "practice 30 minutes" can tell you they've practiced 25 out of 30 days, but can't tell you whether their barre chords have improved or when they last worked on fingerpicking.

The existing study tool (Revision Priority Studio) solves a version of this for exam prep: topics sit under exams, each has confidence and result tracking, and a priority formula surfaces what needs attention. The mastery layer adapts this model for ongoing, open-ended skill-building where there's no exam date — just the continuous pursuit of getting better.

---

## 2. Concept: Skill Items

A **Skill Item** is a discrete piece of knowledge or ability that the user is building over time within an outcome. Examples:

- "Learn guitar" → G major pentatonic scale, Norwegian Wood (song), barre chord transitions, fingerpicking pattern #3
- "Become more healthy" → Proper squat form, meal prep routine, sleep hygiene habits
- "Get better at photography" → Manual exposure, golden hour composition, Lightroom curves editing

Skill items fill the gap between the vague outcome (the "why") and the recurring output (the "when") by tracking the "what" — the specific things being learned and refined over time.

### 2.1 Relationship to Existing Entities

```
Outcome (learn guitar)
├── Output (practice 30 min daily)      ← consistency tracking
├── Output (jam session 1x/week)        ← consistency tracking
├── Skill Item (G major pentatonic)     ← mastery tracking
├── Skill Item (Norwegian Wood)         ← mastery tracking
└── Skill Item (barre chord changes)    ← mastery tracking
```

Skill items belong to the **outcome**, not to a specific output. Any output session under that outcome can advance any skill item. When the user completes their daily practice output, they tag which skills they worked on — those might be different from what they work on during a weekly jam session, but all skills live in the same pool.

---

## 3. Skill Item Lifecycle

Each skill item moves through three stages:

```
Active  →  Review  →  Archived
```

### 3.1 Active

The default state. The skill needs regular, deliberate practice. Active skills appear in the priority queue and are surfaced as daily suggestions.

### 3.2 Review

The skill is "learned" but benefits from occasional revisiting to maintain it. Review skills appear in the priority queue at a much lower frequency (longer intervals between suggested sessions). They don't count toward the active practice load.

**Graduation trigger:** A skill is eligible when its **3 most recent logs** all have confidence 4 or 5 and all are within the last 30 days. When eligible, the app shows a prompt-first decision:

- `Move to Review` (primary action)
- `Keep Active`

The stage changes only if the user confirms `Move to Review`. If the user chooses `Keep Active`, set `graduation_suppressed_at` and suppress re-prompting until a newly-created qualifying log occurs after that timestamp.

### 3.3 Archived

The skill is either fully internalized (no review needed) or abandoned. Archived skills don't appear anywhere unless the user actively looks for them. In v1, archiving is manual only. Auto-archive after no practice in review stage is deferred to v1.1+.

### 3.4 Reactivation

Any skill can be moved back to Active at any time. Confidence-drop reactivation prompts (e.g., confidence <= 2 while in review) are deferred to v1.1+.

---

## 4. Priority Formula

Adapted from the Revision Priority Studio formula, modified for open-ended skill-building without exam deadlines.

```
priorityScore = (confidencePressure × 0.45) + (recencyPressure × 0.40) + (targetPressure × 0.15)
```

### 4.1 Confidence Pressure (45%)

Based on the most recent confidence rating (1–5). Lower confidence = higher priority.

```
confidencePressure = (1 - (latestConfidence - 1) / 4) × 100
```

**Cold-start fallback:** For skills with no logs yet, `latestConfidence` defaults to the skill's `initial_confidence` value (set at creation, defaults to 1).

| Confidence | Pressure |
|---|---|
| 1 | 100 |
| 2 | 75 |
| 3 | 50 |
| 4 | 25 |
| 5 | 0 |

Weighted at 45% (slightly lower than the study tool's 50%) because without an exam deadline, confidence is important but recency becomes relatively more important for maintaining momentum.

### 4.2 Recency Pressure (40%)

Based on days since last practice, scaled against a target interval derived from confidence (spaced repetition logic).

```
targetInterval = 2 ^ (latestConfidence - 1) days

recencyPressure = min((daysSinceLast / targetInterval) × 100, 100)
```

**Cold-start fallback:** For skills with no logs, `daysSinceLast` is calculated from the skill's `created_at` date. Combined with the default `initial_confidence` of 1 (which gives a 1-day target interval), a new skill created yesterday would have recency pressure of 100 — ensuring new low-confidence skills surface immediately.

| Confidence | Target Interval | Meaning |
|---|---|---|
| 1 | 1 day | Practice daily |
| 2 | 2 days | Every other day |
| 3 | 4 days | Twice a week |
| 4 | 8 days | Weekly-ish |
| 5 | 16 days | Biweekly |

Weighted at 40% (higher than the study tool's 30%) because recency is the primary driver for ongoing skill maintenance — the "you haven't touched this in a while" signal matters more when there's no exam forcing urgency.

### 4.3 Target Pressure (15%)

If the skill has a measurable target, this reflects how far the user is from hitting it. If no target is set, this component scores 50 (neutral).

```
If target exists:
  targetPressure = (1 - min(latestValue / targetValue, 1)) × 100

If no target:
  targetPressure = 50
```

Weighted at 15% (lower than the study tool's 20% for result) because many skills won't have measurable targets, and confidence is a more reliable signal for subjective skills.

**Note:** The formula assumes higher values = closer to target (e.g., "reach 120 BPM"). For v1, all targets are higher-is-better. A `target_direction` flag (`'higher'` / `'lower'`) to support "reduce error rate to 5%" targets is a clean v1.1 addition if needed.

### 4.4 Stage Modifier

Review-stage skills get a blanket penalty to push them below active skills:

```
If stage == 'review':
  finalScore = priorityScore × 0.35
```

This means a review skill with a perfect priority score of 100 would show as 35 — always below any active skill with moderate priority, but still able to surface when it's been long enough since the last review.

### 4.5 Daily Suggestion

Sort all active + review skills by `finalScore` descending. Show the **top 3** as "Suggested focus today" at the top of the daily dashboard when the user has outcomes with skill items. This list is global across outcomes. A "Show more" link reveals the full prioritized list.

---

## 5. UX Flows

### 5.1 Adding Skill Items

From the outcome detail view, an "Add Skill" form:

- **Name** (required): Free text, e.g., "G major pentatonic scale"
- **Measurable target** (optional): A label + numeric value, e.g., "Clean at 120 BPM". Stored as `target_label` (TEXT) + `target_value` (NUMERIC).
- **Initial confidence** (optional, default 1): 1–5 rating so the priority formula has a starting point.

Skills are added at any time. There's no limit on the number of skills per outcome, but the priority formula ensures only the most relevant ones surface daily.

### 5.2 Post-Completion Skill Logging

When the user logs any non-zero completion for an output (full or partial — `completed > 0`), and the parent outcome has skill items, the app shows a **collapsed inline prompt** below the completion row:

```
✓ Practice guitar — 30 min ✓
  [Log skills worked ▸]        ← single subtle link, not an expanded panel
```

Tapping "Log skills worked" expands the full skill logging panel:

```
What did you work on?
┌─────────────────────────────────────────────┐
│ Suggested today:                            │
│  ☐ G major pentatonic   (priority: 82)      │
│  ☐ Barre chord changes  (priority: 71)      │
│  ☐ Norwegian Wood        (priority: 65)     │
│                                              │
│ All skills ▾                                 │
│──────────────────────────────────────────────│
│ [Skip — just log the output]                 │
└─────────────────────────────────────────────┘
```

In this post-completion panel, suggestions are **outcome-scoped** to the parent outcome of the output being logged.

The user checks off which skills they worked on. For each checked skill, a mini-form expands inline:

```
☑ G major pentatonic
  Confidence: ① ② ③ ④ ⑤    (tap to rate)
  Clean at BPM: [___]        (optional, shows only if target exists)
```

This should be fast — two taps per skill (check + confidence) with the target field optional. The user can also skip skill logging entirely if they just want to mark the output done. Skipping is always one tap, never buried.

**Key UX decisions:**
- The panel is **collapsed by default** — the prompt is a single line, not an expanded form. This preserves the "under 10 seconds" completion target for users who don't want to log skills on a given day.
- **Partial completions trigger the prompt** (e.g., doing 1 of 3 sets still means you worked on skills). Only a zero-completion log (or no log) skips the prompt entirely.
- The `action_log_id` on each resulting skill log is always set at creation time — it references the action log that was just created by the completion. The nullable FK is purely defensive (`on delete set null`) for cases where the action log is later deleted.

### 5.3 Skill Detail View

Tapping a skill item from the outcome detail or the priority list opens a detail view showing:

- Skill name, stage (active/review), and target (if any)
- Confidence trend: small line chart of confidence ratings over time
- Target progress: line chart of target values over time (if applicable), with the target value as a horizontal goal line
- Practice log: chronological list of all sessions that tagged this skill, with dates, confidence, target value, and the output it was logged against
- Manual stage override: button to graduate, reactivate, or archive

### 5.4 Integration with Weekly Review

The weekly review grid already shows output completion. Skill data integrates in two places:

- **Per-outcome summary (v1):** Below the output completion grid, a small "Skills worked this week" line showing how many unique skills were practiced and average confidence delta (e.g., "+0.4 avg confidence across 5 skills"). This is a quick health check, not a deep dive — one line of text, trivial to compute from the week's skill logs.
- **Graduation notifications (v1.1):** If any skills auto-graduated during the week, surface them here so the user can celebrate or override. Deferred because it requires tracking graduation events, which adds complexity beyond the core v1 skill logging flow.

---

## 6. Data Model Additions

### 6.1 New Tables

| Entity | Key Fields |
|---|---|
| **Skill Item** | id (UUID), user_id (UUID), outcome_id (UUID FK), name (TEXT), stage (TEXT: 'active' / 'review' / 'archived'), target_label (TEXT, nullable), target_value (NUMERIC, nullable), initial_confidence (INT 1-5), graduation_suppressed_at (TIMESTAMPTZ, nullable), created_at (TIMESTAMPTZ) |
| **Skill Log** | id (UUID), user_id (UUID), skill_item_id (UUID FK), action_log_id (UUID FK, nullable), confidence (INT 1-5), target_result (NUMERIC, nullable), logged_at (TIMESTAMPTZ) |

### 6.2 Schema (Postgres / Supabase)

```sql
create table if not exists public.skill_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  outcome_id uuid not null references public.outcomes(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  stage text not null default 'active' check (stage in ('active', 'review', 'archived')),
  target_label text,
  target_value numeric,
  initial_confidence integer not null default 1 check (initial_confidence >= 1 and initial_confidence <= 5),
  graduation_suppressed_at timestamptz,
  created_at timestamptz not null default now(),

  constraint target_fields_together
    check ((target_label is null) = (target_value is null))
);

create table if not exists public.skill_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  skill_item_id uuid not null references public.skill_items(id) on delete cascade,
  action_log_id uuid references public.action_logs(id) on delete set null,
  confidence integer not null check (confidence >= 1 and confidence <= 5),
  target_result numeric,
  logged_at timestamptz not null default now()
);

create index if not exists skill_items_outcome_stage_idx
  on public.skill_items (outcome_id, stage);

create index if not exists skill_logs_skill_item_logged_idx
  on public.skill_logs (skill_item_id, logged_at desc);

create unique index if not exists skill_logs_skill_action_unique_idx
  on public.skill_logs (skill_item_id, action_log_id)
  where action_log_id is not null;

create unique index if not exists skill_items_outcome_name_live_unique_idx
  on public.skill_items (outcome_id, lower(trim(name)))
  where stage in ('active', 'review');

-- RLS (same pattern as all other tables)
alter table public.skill_items enable row level security;
alter table public.skill_logs enable row level security;

create policy skill_items_owner on public.skill_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy skill_logs_owner on public.skill_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

### 6.3 Relationship Notes

- `skill_logs.action_log_id` is nullable and has `on delete set null` — if an action log is deleted, the skill practice record survives. The skill log is valuable independent of whether the output completion still exists. **In v1, `action_log_id` is always set at creation time** — skill logs are only created via the post-completion flow, which always has an associated action log. The nullable FK is purely defensive for the deletion case. A standalone "log skills outside scheduled outputs" flow (which would create skill logs with null `action_log_id`) is a potential v1.1 addition.
- If a user edits an action log to `completed = 0`, application logic deletes linked `skill_logs` for that `action_log_id` (the session is treated as not performed). This is intentionally different from hard row deletion behavior above.
- The `target_fields_together` constraint ensures you can't set a target label without a value or vice versa.
- `target_result` is optional per skill log, even when a target exists on the skill item.
- `stage` transitions are enforced in application code, not DB constraints, since the valid transitions depend on business logic (auto-graduation, reactivation prompts).

---

## 7. Priority Computation: Where It Runs

The priority formula is **computed client-side** from the raw skill_items and skill_logs data. No stored priority column, no server-side cron. Reasoning:

- The data volume is small (tens of skills, hundreds of logs at most).
- Priority depends on "today's date" so it changes daily without any writes.
- Client-side computation means the priority queue works instantly after any log, with no round-trip.
- The daily dashboard already fetches outcome + output + action log data; adding skill items and recent logs to that single RPC call is negligible overhead.

---

## 8. Versioning

### Ships in v1 (with the mastery layer feature)

- Skill item CRUD (add, edit name/target, archive)
- Stage lifecycle (active → review → archived) with manual overrides
- Auto-graduation (3 consecutive confidence 4+ logs within 30 days)
- Post-completion skill logging (collapsed prompt after any non-zero completion)
- Priority formula and "top 3 suggested" on daily dashboard
- Confidence trend chart per skill
- Target progress chart per skill (if target set)
- Skill practice log (chronological list)
- Weekly review: minimal per-outcome skill summary (skills worked count + avg confidence delta)

### Deferred to v1.1+

- Reactivation prompts (confidence drop detection)
- Auto-archive after 90 days of no review-stage logs
- Weekly review graduation celebrations
- "Practice plan" pre-session view (dedicated screen with full prioritised list, filters by stage)
- Spaced repetition interval customisation (let user tune the `2^(n-1)` curve)
- Target direction flag (lower-is-better targets)
- Standalone skill logging outside scheduled outputs
- Context-aware skill suggestions per output type

---

## 9. Open Questions

1. **Should skills be taggable/categorisable within an outcome?** For guitar, you might want "technique" vs "repertoire" vs "theory" groupings. This is probably a v1.1 feature but worth noting.

2. **Should the app suggest creating skill items?** If a user has an outcome with outputs but zero skills, should the app prompt "Want to add specific skills you're building?" after the first few completed outputs? Leaning yes, as a one-time nudge.

3. **Bulk skill logging across multiple skills in one session.** The current UX flow handles this (check multiple skills, rate each), but if someone practices 8 skills in one session, that's 8 inline confidence ratings. Should there be a "rate all as 3" batch option? Probably worth adding if it feels slow in practice.

4. **Table naming convention.** All Postgres tables use **plural names**: `outcomes`, `outputs`, `action_logs`, `metrics`, `metric_entries`, `reflections`, `hypotheses`, `output_change_logs`, `skill_items`, `skill_logs`. This matches the existing study tool's convention (`exams`, `topics`, `study_sessions`) and the FK references in this addendum's schema.
