# Skills Mastery Update — Implementation Plan

**Date:** February 23, 2026  
**Status:** Ready to implement  
**Source of truth:** `docs/skills-addendum.md`, `docs/skills-mastery-qa.md`

---

## 1) Scope and Constraints

### In v1
- Skill item CRUD under outcome detail route
- Skill stages: `active`, `review`, `archived` (manual transitions)
- Prompt-first auto-graduation eligibility check (3 recent logs, confidence >= 4, within 30 days)
- DB-persisted graduation suppression (`graduation_suppressed_at`)
- Post-completion skill logging for non-zero action logs
- Upsert skill logs per `(skill_item_id, action_log_id)`
- Priority formula and dashboard top-3 global suggestions
- Outcome-scoped suggestions in post-completion panel
- Skill detail view with confidence and target charts
- Weekly review per-outcome skill summary: skills worked count + avg confidence delta

### Deferred to v1.1+
- Confidence-drop reactivation prompts
- Auto-archive inactivity rules
- Graduation celebration feed
- Standalone skill logging (without action log)
- Target direction (`lower-is-better`)

---

## 2) Milestones (Prioritized)

## M1. Data Layer and Migration (P0)
- Add migration for `skill_items` and `skill_logs`.
- Add `skill_items.graduation_suppressed_at timestamptz null`.
- Add unique index for active/review skill names per outcome:
  - `(outcome_id, lower(trim(name))) where stage in ('active','review')`.
- Add unique index for skill log per session:
  - `(skill_item_id, action_log_id) where action_log_id is not null`.
- Add RLS policies using existing `user_id` pattern.
- Add supporting indexes for outcome/stage and log recency queries.

**Exit criteria**
- Migration applies cleanly on local and hosted Supabase.
- RLS blocks cross-user access.
- DB constraints enforce uniqueness and target field pairing.

## M2. Domain and Priority Engine (P0)
- Add typed models for skill items/logs.
- Implement pure functions for:
  - latest confidence fallback to `initial_confidence`
  - recency by local date boundary (integer days)
  - target pressure fallback (`100` when target exists and no result)
  - stage modifier for review skills
  - final priority score and sorted queue
- Implement outcome-scoped subset helper for post-completion panel.

**Exit criteria**
- Deterministic priority outputs for fixture data.
- Top-3 global and outcome-scoped lists both available.

## M3. Outcome Detail Route and Skill CRUD (P0)
- Add `/outcomes/:id` route.
- Show outcome metadata, outputs list, skill list.
- Add skill create/edit form:
  - `name`, optional `target_label` + `target_value`, optional `initial_confidence`
- Add stage actions:
  - `active->review`, `active->archived`, `review->active`, `review->archived`, `archived->active`
- Prevent duplicate live skill names by surfacing DB constraint errors cleanly.

**Exit criteria**
- Full skill item CRUD works with stage transitions.
- Route is reachable from dashboard and outcomes list.

## M4. Post-Completion Skill Logging Integration (P0)
- Extend action logging UI:
  - for any `completed > 0`, show collapsed `Log skills worked` prompt
  - for `completed = 0`, no skill prompt
- Expand panel with:
  - outcome-scoped suggested skills
  - full skill list
  - per-selected skill confidence (required)
  - optional target result input when skill has target
- Save as upsert keyed by `(skill_item_id, action_log_id)`.
- Re-open behavior pre-populates existing logged values.
- On action log update to `completed = 0`, delete linked skill logs in app logic.

**Exit criteria**
- One-tap skip path preserved.
- No duplicate logs per skill/session.
- Reverting completion to zero removes linked skill logs.

## M5. Auto-Graduation Prompt Flow (P0)
- Evaluate graduation only on new skill log creation.
- Eligibility: 3 most recent logs for skill, all `confidence >= 4`, all within 30 days.
- Show prompt-first decision:
  - `Move to Review` updates stage to `review`
  - `Keep Active` updates `graduation_suppressed_at = now()`
- Re-prompt only when a new qualifying log has `logged_at > graduation_suppressed_at`.

**Exit criteria**
- No silent stage transition.
- Suppression survives refresh and device changes.

## M6. Daily Dashboard Suggested Focus (P1)
- Add global top-3 skill suggestions at dashboard top.
- Add "Show more" list with rank and score.
- Link suggestions to skill detail within outcome route.

**Exit criteria**
- Suggestions update immediately after skill log changes.
- Global ranking matches formula order.

## M7. Skill Detail View (P1)
- Add skill detail route under outcome context.
- Show:
  - skill metadata + stage + target
  - confidence trend chart
  - target progress chart with horizontal target line
  - chronological practice log with linked output/action context
  - manual stage override actions

**Exit criteria**
- All skill history visible in one page.
- Charts render for empty, sparse, and dense data.

## M8. Weekly Review Integration (P1)
- Compute per-outcome:
  - unique skills practiced this week
  - average confidence delta:
    - last confidence this week - most recent confidence before week
    - fallback baseline: `initial_confidence`
- Display one-line summary with sign and 1 decimal.
- Show "No skills practiced this week" when applicable.

**Exit criteria**
- Summary appears for each active outcome.
- Delta formula matches QA examples.

## M9. Quality, Hardening, and Release (P0)
- Unit tests:
  - priority formula components
  - graduation eligibility/suppression behavior
  - weekly delta calculation
- Integration tests:
  - skill CRUD + stage transitions
  - action log -> skill log upsert
  - completed=0 -> linked skill log deletion
- Performance checks:
  - dashboard queries remain responsive with skills/logs added
- Documentation updates:
  - README and migration notes

**Exit criteria**
- `npm run lint` and `npm run build` pass.
- New tests pass in CI/local.
- Manual smoke test checklist completed.

---

## 3) Suggested Delivery Order

1. M1 -> M2 -> M3 (schema + primitives + route shell)
2. M4 -> M5 (core logging + graduation behavior)
3. M6 -> M7 -> M8 (insights views)
4. M9 (hardening + release)

---

## 4) Risk Notes

- Prompt-first graduation requires careful UX state handling to avoid duplicate prompts.
- Name uniqueness is enforced in DB; UI must surface conflicts clearly.
- Skill log deletion semantics intentionally differ by path:
  - edit action to zero => delete linked skill logs
  - hard delete action row => `action_log_id` becomes null
