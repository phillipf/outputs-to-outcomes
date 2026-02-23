import { useEffect, useMemo, useState } from 'react'

import { fetchDailyDashboard, saveActionLog } from './dashboardApi'
import type { DashboardOutput, DailyDashboardPayload } from './types'

type LogDraft = {
  completed: number
  total: number
  notes: string
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function toLocalDateInputValue(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')

  return `${year}-${month}-${day}`
}

function createDraft(output: DashboardOutput): LogDraft {
  return {
    completed: output.today_log?.completed ?? 0,
    total:
      output.today_log?.total ??
      (output.frequency_type === 'flexible_weekly' ? output.frequency_value : 1),
    notes: output.today_log?.notes ?? '',
  }
}

function frequencyDescription(output: DashboardOutput): string {
  if (output.frequency_type === 'daily') {
    return 'Daily'
  }

  if (output.frequency_type === 'flexible_weekly') {
    return `${output.frequency_value}x/week (flexible)`
  }

  const days = (output.schedule_weekdays ?? []).map((day) => WEEKDAY_LABELS[day]).join(', ')

  return `Fixed weekly (${days || 'no days'})`
}

export function DashboardPage() {
  const [selectedDate, setSelectedDate] = useState(() => toLocalDateInputValue())
  const [dashboard, setDashboard] = useState<DailyDashboardPayload | null>(null)
  const [logDrafts, setLogDrafts] = useState<Record<string, LogDraft>>({})
  const [loading, setLoading] = useState(true)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const scheduledOutputs = useMemo(() => {
    if (!dashboard) {
      return [] as Array<{ outcomeTitle: string; output: DashboardOutput }>
    }

    return dashboard.outcomes.flatMap((outcome) =>
      outcome.outputs
        .filter((output) => output.scheduled_today)
        .map((output) => ({
          outcomeTitle: outcome.title,
          output,
        })),
    )
  }, [dashboard])

  const completedCount = useMemo(() => {
    return scheduledOutputs.filter(({ output }) => {
      const log = output.today_log

      if (!log) {
        return false
      }

      return log.total > 0 && log.completed >= log.total
    }).length
  }, [scheduledOutputs])

  const completionRate = useMemo(() => {
    if (!scheduledOutputs.length) {
      return 0
    }

    return Math.round((completedCount / scheduledOutputs.length) * 100)
  }, [completedCount, scheduledOutputs.length])

  async function loadDashboard(date: string) {
    setLoading(true)
    setErrorMessage(null)

    try {
      const payload = await fetchDailyDashboard(date)
      setDashboard(payload)

      const nextDrafts = payload.outcomes.reduce<Record<string, LogDraft>>((acc, outcome) => {
        outcome.outputs.forEach((output) => {
          acc[output.id] = createDraft(output)
        })

        return acc
      }, {})

      setLogDrafts(nextDrafts)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load dashboard'
      setErrorMessage(message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadDashboard(selectedDate)
  }, [selectedDate])

  function setDraftValue<K extends keyof LogDraft>(
    outputId: string,
    key: K,
    value: LogDraft[K],
  ) {
    setLogDrafts((previous) => {
      const base = previous[outputId] ?? {
        completed: 0,
        total: 1,
        notes: '',
      }

      return {
        ...previous,
        [outputId]: {
          ...base,
          [key]: value,
        },
      }
    })
  }

  async function persistLog(outputId: string, draft: LogDraft, opKey: string) {
    setBusyKey(opKey)
    setErrorMessage(null)

    try {
      await saveActionLog({
        outputId,
        actionDate: selectedDate,
        completed: draft.completed,
        total: draft.total,
        notes: draft.notes,
      })

      await loadDashboard(selectedDate)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save action log'
      setErrorMessage(message)
    } finally {
      setBusyKey(null)
    }
  }

  async function markDone(output: DashboardOutput) {
    const draft: LogDraft = {
      completed: 1,
      total: output.frequency_type === 'flexible_weekly' ? output.frequency_value : 1,
      notes: logDrafts[output.id]?.notes ?? '',
    }

    setLogDrafts((previous) => ({ ...previous, [output.id]: draft }))
    await persistLog(output.id, draft, `quick-done-${output.id}`)
  }

  async function markMissed(output: DashboardOutput) {
    const draft: LogDraft = {
      completed: 0,
      total: output.frequency_type === 'flexible_weekly' ? output.frequency_value : 1,
      notes: logDrafts[output.id]?.notes ?? '',
    }

    setLogDrafts((previous) => ({ ...previous, [output.id]: draft }))
    await persistLog(output.id, draft, `quick-missed-${output.id}`)
  }

  if (loading) {
    return (
      <section className="stack">
        <header className="stack-sm">
          <p className="eyebrow">Daily Dashboard</p>
          <h1>Today</h1>
        </header>
        <article className="panel">Loading dashboard...</article>
      </section>
    )
  }

  return (
    <section className="stack">
      <header className="stack-sm">
        <p className="eyebrow">Daily Dashboard</p>
        <h1>Today</h1>
        <p className="muted">Log output actions, notes, and partial progress for this week.</p>
      </header>

      {errorMessage ? <p className="status-bad">{errorMessage}</p> : null}

      <article className="panel dashboard-controls">
        <label className="form-row" htmlFor="dashboard-date">
          Log date (current week only)
          <input
            id="dashboard-date"
            max={dashboard?.week_end}
            min={dashboard?.week_start}
            onChange={(event) => setSelectedDate(event.target.value)}
            type="date"
            value={selectedDate}
          />
        </label>
        <p className="hint">
          Week: {dashboard?.week_start} to {dashboard?.week_end}
        </p>
      </article>

      <div className="kpi-grid">
        <article className="kpi-card panel">
          <p className="kpi-label">Scheduled Outputs</p>
          <p className="kpi-value">{scheduledOutputs.length}</p>
        </article>
        <article className="kpi-card panel">
          <p className="kpi-label">Completed Today</p>
          <p className="kpi-value">{completedCount}</p>
        </article>
        <article className="kpi-card panel">
          <p className="kpi-label">Completion Rate</p>
          <p className="kpi-value">{completionRate}%</p>
        </article>
        <article className="kpi-card panel">
          <p className="kpi-label">Missed Yesterday</p>
          <p className="kpi-value">{dashboard?.missed_yesterday_count ?? 0}</p>
        </article>
      </div>

      {scheduledOutputs.length === 0 ? (
        <article className="panel">No outputs scheduled for {selectedDate}.</article>
      ) : (
        <div className="stack">
          {scheduledOutputs.map(({ outcomeTitle, output }) => {
            const draft = logDrafts[output.id] ?? createDraft(output)
            const saveKey = `save-${output.id}`
            const isSaving =
              busyKey === saveKey ||
              busyKey === `quick-done-${output.id}` ||
              busyKey === `quick-missed-${output.id}`

            return (
              <article className="panel output-row" key={output.id}>
                <div className="stack-xs">
                  <p className="eyebrow">{outcomeTitle}</p>
                  <h3>{output.description}</h3>
                  <p className="muted">
                    {frequencyDescription(output)} · Week progress: {output.weekly_progress.completed}/
                    {output.weekly_progress.target} ({output.weekly_progress.rate}%)
                  </p>
                </div>

                <div className="actions-row">
                  <button
                    className="btn"
                    disabled={isSaving}
                    onClick={() => void markDone(output)}
                    type="button"
                  >
                    Mark done
                  </button>
                  <button
                    className="btn btn-secondary"
                    disabled={isSaving}
                    onClick={() => void markMissed(output)}
                    type="button"
                  >
                    Mark missed
                  </button>
                </div>

                <div className="action-form-grid">
                  <label className="form-row" htmlFor={`completed-${output.id}`}>
                    Completed
                    <input
                      id={`completed-${output.id}`}
                      min={0}
                      onChange={(event) =>
                        setDraftValue(output.id, 'completed', Number(event.target.value))
                      }
                      type="number"
                      value={draft.completed}
                    />
                  </label>

                  <label className="form-row" htmlFor={`total-${output.id}`}>
                    Total
                    <input
                      id={`total-${output.id}`}
                      min={0}
                      onChange={(event) =>
                        setDraftValue(output.id, 'total', Number(event.target.value))
                      }
                      type="number"
                      value={draft.total}
                    />
                  </label>
                </div>

                <label className="form-row" htmlFor={`notes-${output.id}`}>
                  Notes (optional)
                  <textarea
                    id={`notes-${output.id}`}
                    maxLength={500}
                    onChange={(event) => setDraftValue(output.id, 'notes', event.target.value)}
                    rows={2}
                    value={draft.notes}
                  />
                </label>

                <button
                  className="btn"
                  disabled={isSaving}
                  onClick={() => void persistLog(output.id, draft, saveKey)}
                  type="button"
                >
                  {isSaving ? 'Saving...' : 'Save log'}
                </button>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
