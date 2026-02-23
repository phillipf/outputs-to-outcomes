# Skills Mastery Smoke Checklist (v1)

Date: February 23, 2026
Owner: local dev validation

## Preconditions

- Supabase migrations applied:
  - `supabase/migrations/20260223130000_init_schema.sql`
  - `supabase/migrations/20260223143000_skill_mastery_layer.sql`
- App boots with valid `.env.local`.
- At least one active outcome and scheduled output exists.

## Smoke Steps

1. Outcome detail route and skill CRUD
   - Open `Outcomes` list and navigate to `/outcomes/:id`.
   - Create a skill with no target and initial confidence `1`.
   - Create a skill with a target label/value.
   - Edit a skill and verify updates persist.
   - Attempt duplicate live name (case-insensitive) and verify clear error.

2. Manual stage transitions
   - From `active`, move skill to `review`.
   - From `review`, move skill to `active` and `archived`.
   - From `archived`, move skill back to `active`.

3. Daily dashboard suggestion and skill logging flow
   - Confirm top-3 global suggestions render.
   - Expand `Show more` and verify rank + score list appears.
   - Mark output done with `completed > 0`, open `Log skills worked`.
   - Save selected skills with confidence and optional target result.
   - Re-open same session and verify values pre-populate.
   - Update same action log to `completed = 0`; verify linked skill logs are removed.

4. Graduation prompt and suppression
   - Create three recent logs with confidence `>= 4` for an active skill.
   - Verify prompt appears after newly created qualifying log.
   - Choose `Keep Active`, then verify no re-prompt until a newer qualifying log.
   - Choose `Move to Review` and verify stage updates.

5. Skill detail view and weekly review
   - Open skill detail route `/outcomes/:outcomeId/skills/:skillId`.
   - Verify confidence chart and target chart (if target exists).
   - Verify practice log includes output/action context.
   - Open weekly review and verify per-outcome:
     - skills worked count
     - avg confidence delta (one decimal sign formatting)

## Performance Check Notes

- Query/index readiness:
  - `skill_items_user_outcome_stage_idx`
  - `skill_items_outcome_name_live_unique_idx`
  - `skill_logs_user_skill_logged_idx`
  - `skill_logs_action_log_idx`
  - `skill_logs_skill_action_unique_idx`
- Frontend aggregation checks:
  - `computePriorityQueue` sorts active + review skills only.
  - weekly summary calculation operates on fetched skill/log subsets per outcome.
- Build and test baseline:
  - `npm run test:run`
  - `npm run lint`
  - `npm run build`
