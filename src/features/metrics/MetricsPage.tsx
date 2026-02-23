import { useEffect, useMemo, useState } from 'react'

import {
  createMetric,
  createMetricEntry,
  deleteMetric,
  deleteMetricEntry,
  fetchMetricsPayload,
  updateMetric,
  updateMetricEntry,
} from './metricsApi'
import { LineChart } from './LineChart'
import type { MetricEntryRow, MetricsPayload, MetricRow } from './types'

type MetricDraft = {
  outcomeId: string
  name: string
  unit: string
  isPrimary: boolean
}

type EntryDraft = {
  entryDate: string
  value: string
}

function toDateInputValue(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')

  return `${year}-${month}-${day}`
}

function updateMetricInList(metrics: MetricRow[], updated: MetricRow): MetricRow[] {
  return metrics.map((metric) => (metric.id === updated.id ? updated : metric))
}

function updateEntryInList(entries: MetricEntryRow[], updated: MetricEntryRow): MetricEntryRow[] {
  return entries.map((entry) => (entry.id === updated.id ? updated : entry))
}

export function MetricsPage() {
  const [payload, setPayload] = useState<MetricsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const [metricDraft, setMetricDraft] = useState<MetricDraft>({
    outcomeId: '',
    name: '',
    unit: '',
    isPrimary: false,
  })

  const [entryDrafts, setEntryDrafts] = useState<Record<string, EntryDraft>>({})

  async function loadMetrics() {
    setLoading(true)
    setErrorMessage(null)

    try {
      const data = await fetchMetricsPayload()
      setPayload(data)

      setMetricDraft((previous) => ({
        ...previous,
        outcomeId: previous.outcomeId || data.outcomes[0]?.id || '',
      }))

      const seedDrafts = data.metrics.reduce<Record<string, EntryDraft>>((acc, metric) => {
        acc[metric.id] = {
          entryDate: toDateInputValue(),
          value: '',
        }
        return acc
      }, {})

      setEntryDrafts(seedDrafts)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load metrics'
      setErrorMessage(message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadMetrics()
  }, [])

  const entriesByMetric = useMemo(() => {
    return (payload?.entries ?? []).reduce<Record<string, MetricEntryRow[]>>((acc, entry) => {
      const list = acc[entry.metric_id] ?? []
      list.push(entry)
      acc[entry.metric_id] = list
      return acc
    }, {})
  }, [payload?.entries])

  function setEntryDraft(metricId: string, draft: EntryDraft) {
    setEntryDrafts((previous) => ({
      ...previous,
      [metricId]: draft,
    }))
  }

  function outcomeLabel(outcomeId: string): string {
    const outcome = payload?.outcomes.find((item) => item.id === outcomeId)
    return outcome?.title ?? 'Unknown outcome'
  }

  async function handleCreateMetric() {
    if (!payload) {
      return
    }

    if (!metricDraft.outcomeId || !metricDraft.name.trim()) {
      setErrorMessage('Outcome and metric name are required.')
      return
    }

    setBusyKey('create-metric')
    setErrorMessage(null)

    try {
      const created = await createMetric({
        outcomeId: metricDraft.outcomeId,
        name: metricDraft.name,
        unit: metricDraft.unit,
        isPrimary: metricDraft.isPrimary,
      })

      setPayload((previous) => {
        if (!previous) {
          return previous
        }

        const nextMetrics = metricDraft.isPrimary
          ? previous.metrics.map((metric) =>
              metric.outcome_id === created.outcome_id ? { ...metric, is_primary: false } : metric,
            )
          : previous.metrics

        return {
          ...previous,
          metrics: [created, ...nextMetrics],
        }
      })

      setEntryDraft(created.id, {
        entryDate: toDateInputValue(),
        value: '',
      })

      setMetricDraft((previous) => ({
        ...previous,
        name: '',
        unit: '',
        isPrimary: false,
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create metric'
      setErrorMessage(message)
    } finally {
      setBusyKey(null)
    }
  }

  async function handleEditMetric(metric: MetricRow) {
    const nextName = window.prompt('Metric name', metric.name)

    if (nextName === null) {
      return
    }

    const nextUnit = window.prompt('Metric unit', metric.unit)

    if (nextUnit === null) {
      return
    }

    setBusyKey(`edit-metric-${metric.id}`)
    setErrorMessage(null)

    try {
      const updated = await updateMetric(metric.id, {
        outcomeId: metric.outcome_id,
        name: nextName,
        unit: nextUnit,
        isPrimary: metric.is_primary,
      })

      setPayload((previous) => {
        if (!previous) {
          return previous
        }

        return {
          ...previous,
          metrics: updateMetricInList(previous.metrics, updated),
        }
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update metric'
      setErrorMessage(message)
    } finally {
      setBusyKey(null)
    }
  }

  async function handleSetPrimary(metric: MetricRow, isPrimary: boolean) {
    setBusyKey(`primary-${metric.id}`)
    setErrorMessage(null)

    try {
      const updated = await updateMetric(metric.id, {
        outcomeId: metric.outcome_id,
        name: metric.name,
        unit: metric.unit,
        isPrimary,
      })

      setPayload((previous) => {
        if (!previous) {
          return previous
        }

        const nextMetrics = isPrimary
          ? previous.metrics.map((item) =>
              item.outcome_id === metric.outcome_id
                ? item.id === metric.id
                  ? updated
                  : { ...item, is_primary: false }
                : item,
            )
          : updateMetricInList(previous.metrics, updated)

        return {
          ...previous,
          metrics: nextMetrics,
        }
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update primary metric'
      setErrorMessage(message)
    } finally {
      setBusyKey(null)
    }
  }

  async function handleDeleteMetric(metric: MetricRow) {
    const confirmed = window.confirm(`Delete metric "${metric.name}" and all its entries?`)

    if (!confirmed) {
      return
    }

    setBusyKey(`delete-metric-${metric.id}`)
    setErrorMessage(null)

    try {
      await deleteMetric(metric.id)

      setPayload((previous) => {
        if (!previous) {
          return previous
        }

        return {
          ...previous,
          metrics: previous.metrics.filter((item) => item.id !== metric.id),
          entries: previous.entries.filter((entry) => entry.metric_id !== metric.id),
        }
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete metric'
      setErrorMessage(message)
    } finally {
      setBusyKey(null)
    }
  }

  async function handleAddEntry(metric: MetricRow) {
    const draft = entryDrafts[metric.id]

    if (!draft?.entryDate || !draft.value) {
      setErrorMessage('Entry date and value are required.')
      return
    }

    const value = Number(draft.value)

    if (Number.isNaN(value)) {
      setErrorMessage('Entry value must be numeric.')
      return
    }

    setBusyKey(`add-entry-${metric.id}`)
    setErrorMessage(null)

    try {
      const created = await createMetricEntry({
        metricId: metric.id,
        entryDate: draft.entryDate,
        value,
      })

      setPayload((previous) => {
        if (!previous) {
          return previous
        }

        return {
          ...previous,
          entries: [...previous.entries, created],
        }
      })

      setEntryDraft(metric.id, {
        entryDate: toDateInputValue(),
        value: '',
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add entry'
      setErrorMessage(message)
    } finally {
      setBusyKey(null)
    }
  }

  async function handleEditEntry(entry: MetricEntryRow) {
    const nextDate = window.prompt('Entry date (YYYY-MM-DD)', entry.entry_date)

    if (nextDate === null) {
      return
    }

    const nextValue = window.prompt('Entry value', String(entry.value))

    if (nextValue === null) {
      return
    }

    const numericValue = Number(nextValue)

    if (Number.isNaN(numericValue)) {
      setErrorMessage('Entry value must be numeric.')
      return
    }

    setBusyKey(`edit-entry-${entry.id}`)
    setErrorMessage(null)

    try {
      const updated = await updateMetricEntry(entry.id, {
        entryDate: nextDate,
        value: numericValue,
      })

      setPayload((previous) => {
        if (!previous) {
          return previous
        }

        return {
          ...previous,
          entries: updateEntryInList(previous.entries, updated),
        }
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update entry'
      setErrorMessage(message)
    } finally {
      setBusyKey(null)
    }
  }

  async function handleDeleteEntry(entryId: string) {
    const confirmed = window.confirm('Delete this entry?')

    if (!confirmed) {
      return
    }

    setBusyKey(`delete-entry-${entryId}`)
    setErrorMessage(null)

    try {
      await deleteMetricEntry(entryId)

      setPayload((previous) => {
        if (!previous) {
          return previous
        }

        return {
          ...previous,
          entries: previous.entries.filter((entry) => entry.id !== entryId),
        }
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete entry'
      setErrorMessage(message)
    } finally {
      setBusyKey(null)
    }
  }

  if (loading) {
    return (
      <section className="stack">
        <header className="stack-sm">
          <p className="eyebrow">Metrics</p>
          <h1>Progress Metrics</h1>
        </header>
        <article className="panel">Loading metrics...</article>
      </section>
    )
  }

  return (
    <section className="stack">
      <header className="stack-sm">
        <p className="eyebrow">Metrics</p>
        <h1>Progress Metrics</h1>
        <p className="muted">Create numeric metrics and track trend lines per outcome.</p>
      </header>

      {errorMessage ? <p className="status-bad">{errorMessage}</p> : null}

      <article className="panel stack-sm">
        <h2>Add metric</h2>

        <div className="field-grid">
          <label className="form-row" htmlFor="metric-outcome">
            Outcome
            <select
              id="metric-outcome"
              onChange={(event) =>
                setMetricDraft((previous) => ({
                  ...previous,
                  outcomeId: event.target.value,
                }))
              }
              value={metricDraft.outcomeId}
            >
              {payload?.outcomes.map((outcome) => (
                <option key={outcome.id} value={outcome.id}>
                  {outcome.title}
                </option>
              ))}
            </select>
          </label>

          <label className="form-row" htmlFor="metric-name">
            Name
            <input
              id="metric-name"
              onChange={(event) =>
                setMetricDraft((previous) => ({
                  ...previous,
                  name: event.target.value,
                }))
              }
              value={metricDraft.name}
            />
          </label>

          <label className="form-row" htmlFor="metric-unit">
            Unit label
            <input
              id="metric-unit"
              onChange={(event) =>
                setMetricDraft((previous) => ({
                  ...previous,
                  unit: event.target.value,
                }))
              }
              placeholder="kg, lbs, %, reps"
              value={metricDraft.unit}
            />
          </label>

          <label className="toggle-row" htmlFor="metric-primary">
            <input
              checked={metricDraft.isPrimary}
              id="metric-primary"
              onChange={(event) =>
                setMetricDraft((previous) => ({
                  ...previous,
                  isPrimary: event.target.checked,
                }))
              }
              type="checkbox"
            />
            Set as primary metric for this outcome
          </label>

          <button className="btn" disabled={busyKey === 'create-metric'} onClick={() => void handleCreateMetric()} type="button">
            {busyKey === 'create-metric' ? 'Creating...' : 'Create metric'}
          </button>
        </div>
      </article>

      {payload?.metrics.length === 0 ? <article className="panel">No metrics yet.</article> : null}

      {payload?.metrics.map((metric) => {
        const entries = [...(entriesByMetric[metric.id] ?? [])].sort((a, b) =>
          b.entry_date.localeCompare(a.entry_date),
        )
        const draft = entryDrafts[metric.id] ?? {
          entryDate: toDateInputValue(),
          value: '',
        }

        return (
          <article className="panel stack-sm" key={metric.id}>
            <header className="outcome-header">
              <div className="stack-xs">
                <p className="eyebrow">{outcomeLabel(metric.outcome_id)}</p>
                <h2>{metric.name}</h2>
                <p className="muted">Unit: {metric.unit || '(none)'}</p>
              </div>

              <div className="actions-row">
                {metric.is_primary ? <p className="pill">primary</p> : null}
                <button
                  className="btn btn-secondary"
                  disabled={busyKey === `edit-metric-${metric.id}`}
                  onClick={() => void handleEditMetric(metric)}
                  type="button"
                >
                  Edit
                </button>
                <button
                  className="btn btn-secondary"
                  disabled={busyKey === `primary-${metric.id}`}
                  onClick={() => void handleSetPrimary(metric, !metric.is_primary)}
                  type="button"
                >
                  {metric.is_primary ? 'Unset primary' : 'Set primary'}
                </button>
                <button
                  className="btn btn-secondary"
                  disabled={busyKey === `delete-metric-${metric.id}`}
                  onClick={() => void handleDeleteMetric(metric)}
                  type="button"
                >
                  Delete
                </button>
              </div>
            </header>

            <LineChart entries={[...entries].reverse()} unit={metric.unit} />

            <div className="metric-entry-form">
              <label className="form-row" htmlFor={`entry-date-${metric.id}`}>
                Date
                <input
                  id={`entry-date-${metric.id}`}
                  onChange={(event) =>
                    setEntryDraft(metric.id, {
                      ...draft,
                      entryDate: event.target.value,
                    })
                  }
                  type="date"
                  value={draft.entryDate}
                />
              </label>

              <label className="form-row" htmlFor={`entry-value-${metric.id}`}>
                Value
                <input
                  id={`entry-value-${metric.id}`}
                  onChange={(event) =>
                    setEntryDraft(metric.id, {
                      ...draft,
                      value: event.target.value,
                    })
                  }
                  step="any"
                  type="number"
                  value={draft.value}
                />
              </label>

              <button
                className="btn"
                disabled={busyKey === `add-entry-${metric.id}`}
                onClick={() => void handleAddEntry(metric)}
                type="button"
              >
                {busyKey === `add-entry-${metric.id}` ? 'Saving...' : 'Add entry'}
              </button>
            </div>

            {entries.length > 0 ? (
              <div className="stack-xs">
                {entries.map((entry) => (
                  <div className="entry-row" key={entry.id}>
                    <p>
                      {entry.entry_date}: {entry.value} {metric.unit}
                    </p>
                    <div className="actions-row">
                      <button
                        className="btn btn-secondary"
                        disabled={busyKey === `edit-entry-${entry.id}`}
                        onClick={() => void handleEditEntry(entry)}
                        type="button"
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-secondary"
                        disabled={busyKey === `delete-entry-${entry.id}`}
                        onClick={() => void handleDeleteEntry(entry.id)}
                        type="button"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">No entries yet.</p>
            )}
          </article>
        )
      })}
    </section>
  )
}
