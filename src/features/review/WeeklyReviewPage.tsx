import { useEffect, useMemo, useState } from 'react'

import type { OutcomeRow, OutputRow } from '../outcomes/types'
import {
  fetchWeeklyReview,
  saveShortfallTag,
  saveWeeklyReflection,
  type ActionLogRow,
  type ShortfallReason,
  type ShortfallTagRow,
  type WeeklyReviewPayload,
} from './weeklyReviewApi'

type CellColor = 'green' | 'yellow' | 'red' | 'grey'

type ShortfallDraft = {
  reason: ShortfallReason
  otherText: string
}

type ReflectionDraft = {
  what_worked: string
  what_didnt: string
  what_to_change: string
}

type ShortfallItem = {
  key: string
  outputId: string
  label: string
  occurrenceDate?: string
  weekStart?: string
}

const SHORTFALL_REASON_OPTIONS: Array<{ value: ShortfallReason; label: string }> = [
  { value: 'time', label: 'Time' },
  { value: 'energy', label: 'Energy' },
  { value: 'motivation', label: 'Motivation' },
  { value: 'external_blocker', label: 'External blocker' },
  { value: 'forgot', label: 'Forgot' },
  { value: 'other', label: 'Other' },
]

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function toDateInputValue(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')

  return `${year}-${month}-${day}`
}

function parseDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, (month ?? 1) - 1, day ?? 1)
}

function addDays(value: string, days: number): string {
  const date = parseDate(value)
  date.setDate(date.getDate() + days)
  return toDateInputValue(date)
}

function formatCellDate(value: string): string {
  const date = parseDate(value)
  return `${WEEKDAY_LABELS[date.getDay()]} ${date.getMonth() + 1}/${date.getDate()}`
}

function buildActionLogMap(actionLogs: ActionLogRow[]): Map<string, ActionLogRow> {
  const map = new Map<string, ActionLogRow>()

  actionLogs.forEach((log) => {
    map.set(`${log.output_id}:${log.action_date}`, log)
  })

  return map
}

function buildShortfallMap(shortfalls: ShortfallTagRow[]): Map<string, ShortfallTagRow> {
  const map = new Map<string, ShortfallTagRow>()

  shortfalls.forEach((item) => {
    const key = item.occurrence_date
      ? `${item.output_id}:occ:${item.occurrence_date}`
      : `${item.output_id}:week:${item.week_start}`
    map.set(key, item)
  })

  return map
}

function outputScheduledOnDay(output: OutputRow, dateValue: string): boolean {
  if (output.frequency_type === 'daily') {
    return true
  }

  if (output.frequency_type === 'fixed_weekly') {
    const day = parseDate(dateValue).getDay()
    return (output.schedule_weekdays ?? []).includes(day as 0 | 1 | 2 | 3 | 4 | 5 | 6)
  }

  return false
}

function dayCellState(output: OutputRow, dateValue: string, actionLogMap: Map<string, ActionLogRow>): CellColor {
  if (!outputScheduledOnDay(output, dateValue)) {
    return 'grey'
  }

  const log = actionLogMap.get(`${output.id}:${dateValue}`)

  if (!log || log.completed === 0) {
    return 'red'
  }

  if (log.total > 0 && log.completed / log.total >= 1) {
    return 'green'
  }

  return 'yellow'
}

function flexibleSummaryColor(
  output: OutputRow,
  weekDays: string[],
  actionLogMap: Map<string, ActionLogRow>,
): { color: CellColor; completed: number; target: number } {
  const completed = weekDays.reduce((sum, day) => {
    const log = actionLogMap.get(`${output.id}:${day}`)
    return sum + (log?.completed ?? 0)
  }, 0)

  const target = output.frequency_value

  if (completed >= target) {
    return {
      color: 'green',
      completed,
      target,
    }
  }

  if (completed > 0) {
    return {
      color: 'yellow',
      completed,
      target,
    }
  }

  return {
    color: 'red',
    completed,
    target,
  }
}

function buildWeekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
}

function computeOutcomeCompletion(
  outputs: OutputRow[],
  weekDays: string[],
  actionLogMap: Map<string, ActionLogRow>,
): number {
  let completedUnits = 0
  let targetUnits = 0

  outputs.forEach((output) => {
    if (output.frequency_type === 'flexible_weekly') {
      const flexible = flexibleSummaryColor(output, weekDays, actionLogMap)
      completedUnits += Math.min(flexible.completed, flexible.target)
      targetUnits += flexible.target
      return
    }

    weekDays.forEach((day) => {
      if (!outputScheduledOnDay(output, day)) {
        return
      }

      targetUnits += 1

      const log = actionLogMap.get(`${output.id}:${day}`)

      if (!log || log.completed <= 0 || log.total <= 0) {
        return
      }

      completedUnits += Math.min(log.completed / log.total, 1)
    })
  })

  if (targetUnits === 0) {
    return 0
  }

  return Math.round((completedUnits / targetUnits) * 100)
}

function makeEmptyReflection(): ReflectionDraft {
  return {
    what_worked: '',
    what_didnt: '',
    what_to_change: '',
  }
}

export function WeeklyReviewPage() {
  const [anchorDate, setAnchorDate] = useState(() => toDateInputValue(new Date()))
  const [payload, setPayload] = useState<WeeklyReviewPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const [shortfallDrafts, setShortfallDrafts] = useState<Record<string, ShortfallDraft>>({})
  const [reflectionDrafts, setReflectionDrafts] = useState<Record<string, ReflectionDraft>>({})

  async function loadReview(date: string) {
    setLoading(true)
    setErrorMessage(null)

    try {
      const data = await fetchWeeklyReview(date)
      setPayload(data)

      const shortfalls = buildShortfallMap(data.shortfallTags)
      const shortfallSeeds = Array.from(shortfalls.entries()).reduce<Record<string, ShortfallDraft>>(
        (acc, [key, item]) => {
          acc[key] = {
            reason: item.reason,
            otherText: item.other_text ?? '',
          }
          return acc
        },
        {},
      )
      setShortfallDrafts(shortfallSeeds)

      const reflectionSeeds = data.outcomes.reduce<Record<string, ReflectionDraft>>((acc, outcome) => {
        const existing = data.reflections.find((reflection) => reflection.outcome_id === outcome.id)

        acc[outcome.id] = {
          what_worked: existing?.responses.what_worked ?? '',
          what_didnt: existing?.responses.what_didnt ?? '',
          what_to_change: existing?.responses.what_to_change ?? '',
        }

        return acc
      }, {})
      setReflectionDrafts(reflectionSeeds)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load weekly review'
      setErrorMessage(message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadReview(anchorDate)
  }, [anchorDate])

  const actionLogMap = useMemo(() => buildActionLogMap(payload?.actionLogs ?? []), [payload?.actionLogs])
  const shortfallMap = useMemo(() => buildShortfallMap(payload?.shortfallTags ?? []), [payload?.shortfallTags])

  const outputsByOutcome = useMemo(() => {
    return (payload?.outputs ?? []).reduce<Record<string, OutputRow[]>>((acc, output) => {
      const list = acc[output.outcome_id] ?? []
      list.push(output)
      acc[output.outcome_id] = list
      return acc
    }, {})
  }, [payload?.outputs])

  const weekDays = useMemo(() => {
    if (!payload) {
      return []
    }

    return buildWeekDays(payload.weekStart)
  }, [payload])

  function setShortfallDraft(key: string, draft: ShortfallDraft) {
    setShortfallDrafts((previous) => ({
      ...previous,
      [key]: draft,
    }))
  }

  function setReflectionDraft(outcomeId: string, draft: ReflectionDraft) {
    setReflectionDrafts((previous) => ({
      ...previous,
      [outcomeId]: draft,
    }))
  }

  async function handleSaveShortfall(item: ShortfallItem) {
    const key = item.key
    const draft = shortfallDrafts[key] ?? {
      reason: 'time',
      otherText: '',
    }

    setBusyKey(`shortfall-${key}`)
    setErrorMessage(null)

    try {
      await saveShortfallTag({
        outputId: item.outputId,
        occurrenceDate: item.occurrenceDate,
        weekStart: item.weekStart,
        reason: draft.reason,
        otherText: draft.otherText,
      })

      await loadReview(anchorDate)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save shortfall tag'
      setErrorMessage(message)
    } finally {
      setBusyKey(null)
    }
  }

  async function handleSaveReflection(outcomeId: string) {
    if (!payload) {
      return
    }

    const draft = reflectionDrafts[outcomeId] ?? makeEmptyReflection()

    setBusyKey(`reflection-${outcomeId}`)
    setErrorMessage(null)

    try {
      await saveWeeklyReflection({
        outcomeId,
        weekStart: payload.weekStart,
        responses: {
          what_worked: draft.what_worked,
          what_didnt: draft.what_didnt,
          what_to_change: draft.what_to_change,
        },
      })

      await loadReview(anchorDate)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save reflection'
      setErrorMessage(message)
    } finally {
      setBusyKey(null)
    }
  }

  function buildShortfallsForOutput(output: OutputRow): ShortfallItem[] {
    if (!payload) {
      return []
    }

    if (output.frequency_type === 'flexible_weekly') {
      const summary = flexibleSummaryColor(output, weekDays, actionLogMap)

      if (summary.color === 'green') {
        return []
      }

      return [
        {
          key: `${output.id}:week:${payload.weekStart}`,
          outputId: output.id,
          weekStart: payload.weekStart,
          label: `Weekly target shortfall (${summary.completed}/${summary.target})`,
        },
      ]
    }

    return weekDays
      .map((day) => {
        const state = dayCellState(output, day, actionLogMap)

        if (state !== 'red' && state !== 'yellow') {
          return null
        }

        return {
          key: `${output.id}:occ:${day}`,
          outputId: output.id,
          occurrenceDate: day,
          label: `${formatCellDate(day)} (${state})`,
        } as ShortfallItem
      })
      .filter((item): item is ShortfallItem => item !== null)
  }

  if (loading) {
    return (
      <section className="stack">
        <header className="stack-sm">
          <p className="eyebrow">Weekly Review</p>
          <h1>Review</h1>
        </header>
        <article className="panel">Loading weekly review...</article>
      </section>
    )
  }

  if (!payload) {
    return (
      <section className="stack">
        <header className="stack-sm">
          <p className="eyebrow">Weekly Review</p>
          <h1>Review</h1>
        </header>
        <article className="panel">No weekly data available.</article>
      </section>
    )
  }

  return (
    <section className="stack">
      <header className="stack-sm">
        <p className="eyebrow">Weekly Review</p>
        <h1>Review</h1>
        <p className="muted">Assess completion patterns, tag shortfalls, and write a weekly reflection.</p>
      </header>

      {errorMessage ? <p className="status-bad">{errorMessage}</p> : null}

      <article className="panel week-controls">
        <div className="actions-row">
          <button
            className="btn btn-secondary"
            onClick={() => setAnchorDate((value) => addDays(value, -7))}
            type="button"
          >
            Previous week
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setAnchorDate((value) => addDays(value, 7))}
            type="button"
          >
            Next week
          </button>
        </div>

        <label className="form-row" htmlFor="weekly-anchor-date">
          Anchor date
          <input
            id="weekly-anchor-date"
            onChange={(event) => setAnchorDate(event.target.value)}
            type="date"
            value={anchorDate}
          />
        </label>

        <p className="hint">
          Week window: {payload.weekStart} to {payload.weekEnd}
        </p>
      </article>

      {payload.outcomes.length === 0 ? (
        <article className="panel">No active outcomes to review this week.</article>
      ) : null}

      {payload.outcomes.map((outcome: OutcomeRow) => {
        const outcomeOutputs = outputsByOutcome[outcome.id] ?? []
        const completionPercent = computeOutcomeCompletion(outcomeOutputs, weekDays, actionLogMap)
        const reflectionDraft = reflectionDrafts[outcome.id] ?? makeEmptyReflection()

        return (
          <article className="panel stack" key={outcome.id}>
            <header className="outcome-header">
              <div className="stack-xs">
                <p className="eyebrow">{outcome.category || 'No category'}</p>
                <h2>{outcome.title}</h2>
              </div>
              <p className="pill">{completionPercent}% complete</p>
            </header>

            <section className="stack-sm">
              {outcomeOutputs.length === 0 ? (
                <p className="muted">No active outputs for this outcome.</p>
              ) : null}

              {outcomeOutputs.map((output) => {
                const shortfalls = buildShortfallsForOutput(output)

                return (
                  <div className="output-row" key={output.id}>
                    <div className="stack-xs">
                      <p>
                        <strong>{output.description}</strong>
                      </p>
                    </div>

                    {output.frequency_type === 'flexible_weekly' ? (
                      (() => {
                        const summary = flexibleSummaryColor(output, weekDays, actionLogMap)
                        return (
                          <div className={`summary-cell summary-${summary.color}`}>
                            {summary.completed}/{summary.target}
                          </div>
                        )
                      })()
                    ) : (
                      <div className="week-grid">
                        {weekDays.map((day) => {
                          const state = dayCellState(output, day, actionLogMap)
                          return (
                            <div className={`day-cell day-${state}`} key={`${output.id}-${day}`}>
                              <span className="day-label">{WEEKDAY_LABELS[parseDate(day).getDay()]}</span>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {shortfalls.length > 0 ? (
                      <div className="stack-sm">
                        <p className="muted">Shortfall tags</p>

                        {shortfalls.map((item) => {
                          const existingTag = shortfallMap.get(item.key)
                          const draft = shortfallDrafts[item.key] ?? {
                            reason: existingTag?.reason ?? 'time',
                            otherText: existingTag?.other_text ?? '',
                          }

                          return (
                            <div className="shortfall-row" key={item.key}>
                              <p className="hint">{item.label}</p>

                              <label className="form-row" htmlFor={`shortfall-reason-${item.key}`}>
                                Reason
                                <select
                                  id={`shortfall-reason-${item.key}`}
                                  onChange={(event) =>
                                    setShortfallDraft(item.key, {
                                      ...draft,
                                      reason: event.target.value as ShortfallReason,
                                    })
                                  }
                                  value={draft.reason}
                                >
                                  {SHORTFALL_REASON_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </label>

                              {draft.reason === 'other' ? (
                                <label className="form-row" htmlFor={`shortfall-other-${item.key}`}>
                                  Other details
                                  <input
                                    id={`shortfall-other-${item.key}`}
                                    onChange={(event) =>
                                      setShortfallDraft(item.key, {
                                        ...draft,
                                        otherText: event.target.value,
                                      })
                                    }
                                    value={draft.otherText}
                                  />
                                </label>
                              ) : null}

                              <button
                                className="btn btn-secondary"
                                disabled={busyKey === `shortfall-${item.key}`}
                                onClick={() => void handleSaveShortfall(item)}
                                type="button"
                              >
                                {busyKey === `shortfall-${item.key}` ? 'Saving...' : 'Save tag'}
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </section>

            <section className="stack-sm">
              <h3>Weekly reflection</h3>

              <label className="form-row" htmlFor={`reflection-worked-${outcome.id}`}>
                What worked well this cycle?
                <textarea
                  id={`reflection-worked-${outcome.id}`}
                  onChange={(event) =>
                    setReflectionDraft(outcome.id, {
                      ...reflectionDraft,
                      what_worked: event.target.value,
                    })
                  }
                  rows={2}
                  value={reflectionDraft.what_worked}
                />
              </label>

              <label className="form-row" htmlFor={`reflection-didnt-${outcome.id}`}>
                What didn't work as expected?
                <textarea
                  id={`reflection-didnt-${outcome.id}`}
                  onChange={(event) =>
                    setReflectionDraft(outcome.id, {
                      ...reflectionDraft,
                      what_didnt: event.target.value,
                    })
                  }
                  rows={2}
                  value={reflectionDraft.what_didnt}
                />
              </label>

              <label className="form-row" htmlFor={`reflection-change-${outcome.id}`}>
                What will you try differently next cycle?
                <textarea
                  id={`reflection-change-${outcome.id}`}
                  onChange={(event) =>
                    setReflectionDraft(outcome.id, {
                      ...reflectionDraft,
                      what_to_change: event.target.value,
                    })
                  }
                  rows={2}
                  value={reflectionDraft.what_to_change}
                />
              </label>

              <button
                className="btn"
                disabled={busyKey === `reflection-${outcome.id}`}
                onClick={() => void handleSaveReflection(outcome.id)}
                type="button"
              >
                {busyKey === `reflection-${outcome.id}` ? 'Saving...' : 'Save reflection'}
              </button>
            </section>
          </article>
        )
      })}
    </section>
  )
}
