# Spec Q&A — Skill Mastery Layer

**Context:** Senior developer implementation questions for the Skill Mastery Layer addendum. Answers here are canonical — the addendum has been updated to match.

---

## Scope & Lifecycle (Q1–Q6)

### 1. Is skill mastery in the current release track or a separate post-v1 milestone?

**Current v1 release track.** It's already listed in the Q&A summary's v1 scope and the addendum has its own v1/v1.1 split (section 8). Skill mastery ships alongside the core modules — it's not a separate milestone. The v1 scope is the addendum's "Ships in v1" list; the addendum's "Deferred to v1.1+" items merge into the main v1.1 list.

### 2. Section 3.3 vs Section 8: auto-archive is v1.1. Confirm manual-only in v1?

**Confirmed: v1 is manual archive only.** Section 3.3's mention of auto-archive after 90 days describes the planned behavior but doesn't imply v1 scope — section 8's versioning list is authoritative. The addendum's section 3.3 has been updated to clearly label auto-archive as v1.1.

### 3. What exact manual stage transitions are allowed?

**Five transitions, all manual overrides:**

| From | To | When |
|---|---|---|
| active | review | User manually graduates, or auto-graduation fires |
| active | archived | User decides to abandon or skip this skill |
| review | active | User reactivates (manual, or v1.1 prompted by confidence drop) |
| review | archived | User decides no more review is needed |
| archived | active | User brings it back for active practice |

**Not allowed:** `archived → review` directly. If you're un-archiving, you're putting it back into active practice — it can graduate to review again through the normal path. This keeps the mental model simple: archived is "off," active is "on," review is "graduated."

### 4. For auto-graduation, does "3 consecutive logs" mean the latest 3 with no <4 in between?

**Yes, strictly the most recent 3 skill logs for that skill, all with confidence ≥ 4, all within the last 30 days.** If the last 3 logs are [4, 5, 4] — graduates. If [4, 3, 5] — doesn't graduate (the 3 breaks the streak). The check looks at the 3 most recent logs ordered by `logged_at desc` and verifies all three have `confidence >= 4` and all three have `logged_at` within the last 30 days.

### 5. Should auto-graduation run on log edit/delete, or only on new log creation?

**New log creation only.** Graduation is a forward-looking event — "you've demonstrated consistent confidence." Re-evaluating on edits or deletes adds complexity for a scenario that almost never occurs (you'd have to delete a high-confidence log to undo a graduation that already happened). If a graduation was premature, the user can manually move the skill back to active. Keep the trigger simple.

### 6. If user chooses "keep active" on graduation prompt, do we suppress re-prompting?

**Suppress until the next qualifying log, persisted in DB.** When the user dismisses graduation with "keep active," set `skill_items.graduation_suppressed_at` (`TIMESTAMPTZ`). Re-prompt only when a *newly created* skill log independently qualifies for graduation and has `logged_at > graduation_suppressed_at`. This makes suppression survive refreshes and cross-device use.

---

## Priority Formula Edge Cases (Q7–Q10)

### 7. New skills created today with no logs: eligible for suggestions immediately?

**Yes, immediately eligible.** A skill created today with `initial_confidence = 1` and `daysSinceLast = 0` (since `created_at` is today) would compute: confidence pressure = 100 × 0.45 = 45, recency pressure = min(0/1, 1) × 100 × 0.40 = 0, target pressure = 50 × 0.15 = 7.5 → total = 52.5. That's moderate — it'll appear in suggestions if there are fewer than 3 higher-priority skills, but it won't dominate over skills with overdue recency pressure. This feels right: "you just created it, it's available, but skills you haven't touched in a week are more urgent."

### 8. daysSinceLast computation: integer floor or fractional days?

**Integer floor, based on local date boundaries.** Compare `today` (local date) to the `logged_at` date (converted to local). If the last log was yesterday, `daysSinceLast = 1` regardless of the exact time. This matches how users think about practice ("I practiced yesterday") and avoids time-of-day artifacts where practicing at 11pm gives a different score than 1am. It's also consistent with how the rest of the app handles dates (action logs use local dates, not timestamps, for scheduling).

### 9. Top-3 suggestions: global across all outcomes, or per-outcome cap?

**Global across all outcomes, no per-outcome cap.** If your guitar skills are all overdue and your fitness skills are current, all 3 suggestions should be guitar skills. Artificial per-outcome caps would hide genuinely high-priority items to enforce "fairness" that doesn't serve you. The priority formula already handles this correctly — if you've been practicing fitness skills recently, their recency pressure is low and they naturally fall below overdue guitar skills. The "Show more" link reveals the full list if you want to browse by outcome.

### 10. Target exists but no target_result logs yet: neutral 50 or max 100?

**Max 100 (full pressure).** If you've set a target, you're at 0% progress until proven otherwise. Neutral 50 would understate the gap. The formula is `(1 - min(latestValue / targetValue, 1)) × 100` — with no `latestValue`, treat it as 0, giving pressure of 100. This means a new skill with a target gets a slight priority boost over one without a target (100 × 0.15 = 15 vs 50 × 0.15 = 7.5), which is correct — you explicitly said you want to reach a goal.

---

## Skill Log Integrity (Q11–Q14)

### 11. Can multiple skill_logs exist for the same (skill_item_id, action_log_id) pair?

**No. Add a unique constraint.** One confidence rating per skill per practice session. If you worked on G major pentatonic during your daily practice, that's one skill log entry. You can't log the same skill twice against the same action log.

```sql
create unique index if not exists skill_logs_skill_action_unique_idx
  on public.skill_logs (skill_item_id, action_log_id)
  where action_log_id is not null;
```

The `where action_log_id is not null` partial index ensures the constraint only applies when there's an associated action log (defensive for v1.1 standalone logging).

### 12. User re-opens action log and logs the same skill: update or append?

**Update the existing skill log.** Since Q11 enforces uniqueness on `(skill_item_id, action_log_id)`, re-logging the same skill is an upsert — update the confidence and target_result on the existing row. The UI should pre-populate the previous values when the user re-opens the skill logging panel for an already-completed output, so they can see and adjust their earlier rating. This keeps the data clean and the graduation logic simple (no duplicate logs to filter).

### 13. Action log changed to completed=0: what happens to linked skill logs?

**Delete the linked skill logs in application logic.** If the user reverts a completion to zero, that means "I didn't actually do this output" — any skills tagged against that session are invalid. Implement this in application code (not a DB trigger): when `completed` is set to 0, delete all `skill_logs` where `action_log_id` matches.

This is intentionally different from hard deletion of the `action_logs` row itself. The FK remains `on delete set null` to preserve skill history when an action-log row is deleted outside the normal "set completed to 0" flow.

### 14. What about partial completion reduced but not zeroed (e.g., 3→1)?

**Keep the skill logs.** A reduction from 3/3 to 1/3 still means you did something. Only a reduction to 0 (full revert) triggers skill log deletion. The user can manually re-open the skill logging panel and adjust confidence ratings if the reduced session changes their assessment, but the logs aren't auto-deleted.

---

## Weekly Review & Management (Q15–Q16)

### 15. "Avg confidence delta" formula: define exactly.

**Per-skill delta within the week, then average across skills.**

```
For each skill practiced this week:
  delta = (last confidence logged this week) - (most recent confidence logged BEFORE this week)
  If no prior log exists: delta = (last confidence this week) - initial_confidence

avg_confidence_delta = sum(deltas) / count(skills practiced this week)
```

This measures "how much did my confidence change this week compared to where it was going in." If you practiced 3 skills and your deltas were +1, 0, -1, the average is 0. If you only practiced one skill and it went from 2 to 4, the delta is +2.0.

Edge case: if a skill was created this week and has no prior baseline, use `initial_confidence` as the "before" value. Display as "+0.4 avg" or "-0.2 avg" with one decimal place. If zero skills were practiced, show "No skills practiced this week" instead of a zero delta.

### 16. Should skill items support hard delete?

**No. Archive only, same as outcomes and outputs.** The `archived` stage is the soft-delete. Skill logs reference the skill item — hard-deleting a skill item would orphan or cascade-delete valuable practice history. If a user truly wants to nuke an archived skill and its logs, the "purge retired/archived items" utility in settings (described in the main Q&A) covers this as an intentional, rare action. Don't build a per-skill hard delete button.

### 17. Skill management: embedded in outcomes screen or dedicated route?

**Dedicated outcome-detail route.** The current daily dashboard is a flat list of outputs. Skill items live under outcomes, not outputs, so they need an outcome-level view. Add an `/outcomes/:id` route that shows:

- Outcome metadata (title, status, category)
- Outputs under this outcome (list with status)
- Skill items under this outcome (list with stage, latest confidence, priority score)
- "Add Skill" form
- Tap a skill → skill detail view (confidence chart, target chart, practice log)

The daily dashboard links to this: each output row shows its parent outcome name, tappable to navigate to the outcome detail. This keeps the daily dashboard focused on "what do I do today" while the outcome detail is "what am I building toward and how's it going." The "Suggested focus today" skill suggestions on the daily dashboard link to the skill detail within the outcome-detail route.

---

## Round 2 Clarifications (Q18–Q23)

### 18. In post-completion skill logging, are suggestions global or outcome-scoped?

**Outcome-scoped.** In the inline panel opened from an output completion, "Suggested today" only shows skills from that output's parent outcome. This keeps the logging action focused on what was realistically practiced in that session.

The daily dashboard's top-level "Suggested focus today" block remains **global** across all outcomes.

### 19. Auto-graduation UX sequence: auto-transition then undo, or prompt-first?

**Prompt-first.** When criteria are met, show:

- `Move to Review` (primary action)
- `Keep Active`

The stage only changes if the user confirms `Move to Review`. If they choose `Keep Active`, set `graduation_suppressed_at`.

### 20. Should skill names be unique per outcome?

**Yes, case-insensitive uniqueness per outcome for active/review skills.** Prevent duplicate live skills like "Barre Chords" and "barre chords" under the same outcome. Archived skills do not block reusing a name.

Recommended index:

```sql
create unique index if not exists skill_items_outcome_name_live_unique_idx
  on public.skill_items (outcome_id, lower(trim(name)))
  where stage in ('active', 'review');
```

### 21. Is `target_result` required on each skill log when a target exists?

**No. It stays optional.** If a skill has a target, prompt for `target_result` in the UI, but do not require it. Confidence-only logs remain valid.

### 22. Should addendum wording about auto-archive be updated for consistency?

**Yes.** Lifecycle text must explicitly say auto-archive is deferred to v1.1+, while v1 supports manual archive only.

### 23. Should `graduation_suppressed_at` be in the schema?

**Yes.** Add nullable column on `skill_items`:

```sql
alter table public.skill_items
  add column if not exists graduation_suppressed_at timestamptz;
```
