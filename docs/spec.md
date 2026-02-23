# Outcome & Output Framework App — Functional Specification

**Version:** 1.0  
**Date:** February 23, 2026  
**Status:** Draft

---

## 1. Overview

This application implements the **Outcome and Output Framework**, a goal-achievement system that replaces rigid "SMART" goal-setting with a more adaptive, feedback-driven approach. The core philosophy is that progress comes from consistently performing regular actions (outputs), measuring results, reflecting, and adapting — not from setting perfect goals upfront.

The app is built around four pillars:

1. Flexible outcome and output definition
2. A continuous feedback loop engine
3. Weekly review and strategy adaptation
4. Long-term learning analytics

---

## 2. Module 1 — Outcome and Output Definition

### 2.1 Vague Outcome Input

Users define goals as natural, open-ended aspirations without time limits or rigid metrics.

- **Free-text outcome field** accepting plain language (e.g., "get better at piano," "become more healthy").
- No enforced deadline, specificity score, or "SMART" validation.
- Optional tags/categories for organization (e.g., Health, Creative, Career, Learning).
- Users may have **multiple active outcomes** simultaneously.
- Outcomes can be archived, reactivated, or retired at any time.

### 2.2 Recurring Output Setup

Each outcome is paired with one or more **recurring outputs** — the concrete, regular actions the user commits to.

- **Frequency controls:**
  - Daily (e.g., "practice piano for 20 minutes every day")
  - X times per week (e.g., "publish 3 blog posts per week")
  - Custom schedule (e.g., "Mon/Wed/Fri")
- **Starter Mode:** When a user creates their first output for an outcome, the app suggests a simplified, low-commitment version to prevent over-ambition (e.g., if user enters "run 5 miles daily," suggest "run 1 mile, 3x/week" as a starter).
- Outputs are **editable at any time** without losing historical tracking data.
- Multiple outputs can be linked to a single outcome.

---

## 3. Module 2 — Feedback Loop Engine

The engine drives the **Action → Result → Reflection → Learning** cycle.

### 3.1 Action Logging (Daily Dashboard)

- A daily view listing all outputs scheduled for that day.
- One-tap completion toggle (done / not done).
- Optional notes field per output for quick context.
- Streak counter and current-week completion rate shown inline.
- Support for partial completion (e.g., "did 2 of 3 sets").

### 3.2 Result & Hypothesis Tracking

For outcomes that benefit from quantitative measurement:

- **Custom metric fields** users can attach to an outcome (e.g., body weight, shooting percentage, subscriber count, bench press weight).
- Manual data entry with date stamps.
- Simple trend visualization (line chart) showing metric movement over time.
- Ability to overlay output completion data on the metric chart to visually correlate actions with results.

### 3.3 Reflection Prompts

After a configurable interval (default: weekly), the app prompts the user with guided reflection questions.

- **Default prompts:**
  - "What worked well this cycle?"
  - "What didn't work as expected?"
  - "What will you try differently next cycle?"
- **Context-aware prompts** based on tracked data (e.g., "Your weight has plateaued for 2 weeks — what might you change?").
- Reflections are saved and searchable as a **learning journal** tied to the outcome.

---

## 4. Module 3 — Weekly Review & Adaptability Interface

A dedicated **"Weekly Review"** view designed for end-of-week strategy sessions.

### 4.1 Success Visualization

- **Output completion grid:** A week-at-a-glance matrix showing each output with green (completed), red (missed), or yellow (partial) indicators.
- **Per-outcome summary:** Roll-up completion percentage for all outputs under each outcome.
- **Shortfall tagging:** When an output is missed, the user can tag a reason (time, energy, motivation, external blocker) to surface patterns over time.

### 4.2 Dynamic Output Modification

- From the weekly review, users can **add, pause, swap, or retire outputs** while keeping the parent outcome intact.
- **Plateau detection prompt:** If output completion is consistently high but tracked metrics are flat, the app suggests the user consider changing their approach.
- Change history is logged so users can review what strategies they've tried for each outcome.

---

## 5. Module 4 — Progress & Learning Analytics

Long-term views focused on skill refinement and learning velocity, not just task completion.

### 5.1 Feedback Cycle Counter

- A visible metric counting the number of completed **Action → Result → Reflection** cycles per outcome.
- Framing: "You've completed 12 feedback cycles for 'Get better at piano'" — reinforcing that volume of cycles drives growth.
- Milestone celebrations at key cycle counts (5, 10, 25, 50, 100).

### 5.2 Hypothesis Testing

- Users can formally state a hypothesis tied to an outcome (e.g., "Running 3x/week will reduce my weight by 1 lb/week").
- The app tracks the relevant metric against the stated expectation.
- After a user-defined evaluation period, the app presents a simple verdict:
  - **Supported:** Data trends align with the hypothesis.
  - **Inconclusive:** Not enough data or mixed signals.
  - **Not supported:** Data trends contradict the hypothesis.
- Users are prompted to form a **new hypothesis** and adjust outputs accordingly, closing the loop.

### 5.3 Learning Journal

- Aggregated view of all reflections, hypothesis results, and output changes over time for each outcome.
- Searchable and filterable by date, outcome, or keyword.
- Exportable as markdown or PDF for personal records.

---

## 6. Data Model (Conceptual)

| Entity | Key Fields |
|---|---|
| **User** | id, name, email, preferences |
| **Outcome** | id, user_id, title, category, status, created_at |
| **Output** | id, outcome_id, description, frequency_type, frequency_value, schedule, is_starter, status, created_at |
| **Action Log** | id, output_id, date, completion_status, notes |
| **Metric** | id, outcome_id, name, unit |
| **Metric Entry** | id, metric_id, date, value |
| **Reflection** | id, outcome_id, date, prompt, response |
| **Hypothesis** | id, outcome_id, statement, metric_id, target_value, evaluation_period, status, verdict |
| **Output Change Log** | id, output_id, change_type, old_value, new_value, reason, date |

---

## 7. Key UX Principles

1. **Low friction daily use.** The daily dashboard must load fast and allow completion logging in under 10 seconds.
2. **No guilt design.** Missed outputs are surfaced for reflection, not punishment. No shame-inducing language or aggressive streak-loss notifications.
3. **Adaptability over rigidity.** The app should actively encourage users to change their approach when things aren't working, rather than treating output changes as "failure."
4. **Progressive depth.** New users start with outcomes + simple outputs. Metrics, hypotheses, and analytics unlock naturally as users engage more.
5. **Reflection is a first-class feature.** The learning journal and reflection prompts are not optional add-ons — they are core to the value proposition.

---

## 8. Non-Functional Requirements

| Requirement | Target |
|---|---|
| Platform | Mobile-first (iOS + Android), responsive web |
| Offline support | Action logging must work offline and sync when connected |
| Data export | Full data export in JSON and CSV formats |
| Notifications | Configurable daily reminders and weekly review nudges |
| Performance | Daily dashboard loads in < 1 second |
| Privacy | All user data encrypted at rest; no third-party analytics on reflection content |

---

## 9. Future Considerations

- **Social/accountability features:** Optional sharing of output streaks or weekly reviews with an accountability partner.
- **AI-powered reflection:** Use LLM analysis of reflection entries to surface patterns and suggest strategy changes.
- **Integrations:** Pull metric data from health apps (Apple Health, Google Fit), habit trackers, or spreadsheets.
- **Templates:** Pre-built outcome + output templates for common goals (fitness, learning an instrument, content creation).