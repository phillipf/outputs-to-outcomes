import { type FormEvent, useEffect, useMemo, useState } from 'react'

import {
  createOutcome,
  createOutput,
  fetchOutcomesAndOutputs,
  logOutputChange,
  setOutcomeStatus,
  setOutputStatus,
  updateOutcome,
  updateOutput,
} from './outcomesApi'
import { getStarterSuggestion } from './starterMode'
import type {
  FrequencyType,
  OutcomeRow,
  OutcomeStatus,
  OutputDraft,
  OutputRow,
  OutputStatus,
  Weekday,
} from './types'

type StatusFilter = 'all' | OutcomeStatus

type OutcomeDraft = {
  title: string
  category: string
}

const WEEKDAYS: Array<{ value: Weekday; label: string }> = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
]

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
  { value: 'retired', label: 'Retired' },
]

const EMPTY_OUTCOME_DRAFT: OutcomeDraft = {
  title: '',
  category: '',
}

function makeDefaultOutputDraft(): OutputDraft {
  return {
    description: '',
    frequency_type: 'daily',
    frequency_value: 1,
    schedule_weekdays: [],
    starter_applied: false,
  }
}

function outputToDraft(output: OutputRow): OutputDraft {
  return {
    description: output.description,
    frequency_type: output.frequency_type,
    frequency_value: output.frequency_value,
    schedule_weekdays: output.schedule_weekdays ?? [],
    starter_applied: output.is_starter,
  }
}

function frequencyLabel(output: OutputRow): string {
  if (output.frequency_type === 'daily') {
    return 'Daily'
  }

  if (output.frequency_type === 'flexible_weekly') {
    return `${output.frequency_value}x/week (flexible)`
  }

  const days = (output.schedule_weekdays ?? [])
    .map((day) => WEEKDAYS.find((item) => item.value === day)?.label)
    .filter(Boolean)
    .join(', ')

  return `Fixed weekly (${days || 'no days'})`
}

function starterSuggestionText(draft: OutputDraft): string {
  if (draft.frequency_type === 'daily') {
    return 'Suggested starter: 3x/week flexible.'
  }

  if (draft.frequency_type === 'fixed_weekly') {
    return `Suggested starter: ${(draft.schedule_weekdays || []).length} fixed day(s)/week.`
  }

  return `Suggested starter: ${draft.frequency_value}x/week flexible.`
}

function updateOutcomeInList(list: OutcomeRow[], updated: OutcomeRow): OutcomeRow[] {
  return list.map((outcome) => (outcome.id === updated.id ? updated : outcome))
}

function updateOutputInList(list: OutputRow[], updated: OutputRow): OutputRow[] {
  return list.map((output) => (output.id === updated.id ? updated : output))
}

function isOutputDraftValid(draft: OutputDraft): boolean {
  if (!draft.description.trim()) {
    return false
  }

  if (draft.frequency_type === 'fixed_weekly') {
    return draft.schedule_weekdays.length > 0
  }

  if (draft.frequency_type === 'flexible_weekly') {
    return draft.frequency_value >= 1 && draft.frequency_value <= 7
  }

  return true
}

function outcomeStatusActions(status: OutcomeStatus): OutcomeStatus[] {
  if (status === 'active') {
    return ['archived', 'retired']
  }

  if (status === 'archived') {
    return ['active', 'retired']
  }

  return ['active']
}

function outputStatusActions(status: OutputStatus): OutputStatus[] {
  if (status === 'active') {
    return ['paused', 'retired']
  }

  if (status === 'paused') {
    return ['active', 'retired']
  }

  return ['active']
}

function statusButtonLabel(status: string): string {
  if (status === 'active') {
    return 'Activate'
  }

  if (status === 'archived') {
    return 'Archive'
  }

  if (status === 'retired') {
    return 'Retire'
  }

  if (status === 'paused') {
    return 'Pause'
  }

  return status
}

export function OutcomesPage() {
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const [outcomes, setOutcomes] = useState<OutcomeRow[]>([])
  const [outputs, setOutputs] = useState<OutputRow[]>([])
  const [filter, setFilter] = useState<StatusFilter>('all')

  const [newOutcome, setNewOutcome] = useState<OutcomeDraft>(EMPTY_OUTCOME_DRAFT)
  const [editingOutcomeId, setEditingOutcomeId] = useState<string | null>(null)
  const [editingOutcomeDraft, setEditingOutcomeDraft] = useState<OutcomeDraft | null>(null)

  const [outputDrafts, setOutputDrafts] = useState<Record<string, OutputDraft>>({})
  const [editingOutputId, setEditingOutputId] = useState<string | null>(null)

  async function loadData() {
    setErrorMessage(null)
    setLoading(true)

    try {
      const data = await fetchOutcomesAndOutputs()
      setOutcomes(data.outcomes)
      setOutputs(data.outputs)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load outcomes'
      setErrorMessage(message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  const outputsByOutcome = useMemo(() => {
    return outputs.reduce<Record<string, OutputRow[]>>((acc, output) => {
      const list = acc[output.outcome_id] ?? []
      list.push(output)
      acc[output.outcome_id] = list
      return acc
    }, {})
  }, [outputs])

  const visibleOutcomes = useMemo(() => {
    if (filter === 'all') {
      return outcomes
    }

    return outcomes.filter((outcome) => outcome.status === filter)
  }, [filter, outcomes])

  function ensureDraftForOutcome(outcomeId: string): OutputDraft {
    return outputDrafts[outcomeId] ?? makeDefaultOutputDraft()
  }

  function setDraftForOutcome(outcomeId: string, draft: OutputDraft) {
    setOutputDrafts((previous) => ({
      ...previous,
      [outcomeId]: draft,
    }))
  }

  function setDraftField<K extends keyof OutputDraft>(
    outcomeId: string,
    key: K,
    value: OutputDraft[K],
  ) {
    const base = ensureDraftForOutcome(outcomeId)

    setDraftForOutcome(outcomeId, {
      ...base,
      [key]: value,
      starter_applied: false,
    })
  }

  function toggleWeekday(outcomeId: string, day: Weekday) {
    const draft = ensureDraftForOutcome(outcomeId)
    const hasDay = draft.schedule_weekdays.includes(day)

    const nextDays = hasDay
      ? draft.schedule_weekdays.filter((value) => value !== day)
      : [...draft.schedule_weekdays, day]

    setDraftField(outcomeId, 'schedule_weekdays', nextDays.sort((a, b) => a - b) as Weekday[])
  }

  async function handleCreateOutcome(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!newOutcome.title.trim()) {
      setErrorMessage('Outcome title is required.')
      return
    }

    setBusyKey('create-outcome')
    setErrorMessage(null)

    try {
      const created = await createOutcome({
        title: newOutcome.title,
        category: newOutcome.category,
      })

      setOutcomes((previous) => [created, ...previous])
      setNewOutcome(EMPTY_OUTCOME_DRAFT)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create outcome'
      setErrorMessage(message)
    } finally {
      setBusyKey(null)
    }
  }

  function beginOutcomeEdit(outcome: OutcomeRow) {
    setEditingOutcomeId(outcome.id)
    setEditingOutcomeDraft({
      title: outcome.title,
      category: outcome.category ?? '',
    })
  }

  function cancelOutcomeEdit() {
    setEditingOutcomeId(null)
    setEditingOutcomeDraft(null)
  }

  async function saveOutcomeEdit(outcomeId: string) {
    if (!editingOutcomeDraft?.title.trim()) {
      setErrorMessage('Outcome title is required.')
      return
    }

    setBusyKey(`save-outcome-${outcomeId}`)
    setErrorMessage(null)

    try {
      const updated = await updateOutcome(outcomeId, {
        title: editingOutcomeDraft.title,
        category: editingOutcomeDraft.category,
      })
      setOutcomes((previous) => updateOutcomeInList(previous, updated))
      cancelOutcomeEdit()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update outcome'
      setErrorMessage(message)
    } finally {
      setBusyKey(null)
    }
  }

  async function handleOutcomeStatus(outcome: OutcomeRow, status: OutcomeStatus) {
    setBusyKey(`outcome-status-${outcome.id}`)
    setErrorMessage(null)

    try {
      const updated = await setOutcomeStatus(outcome.id, status)
      setOutcomes((previous) => updateOutcomeInList(previous, updated))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update outcome status'
      setErrorMessage(message)
    } finally {
      setBusyKey(null)
    }
  }

  async function handleCreateOutput(outcomeId: string) {
    const draft = ensureDraftForOutcome(outcomeId)

    if (!isOutputDraftValid(draft)) {
      setErrorMessage('Output draft is incomplete. Add description and valid frequency.')
      return
    }

    const isFirstOutput = (outputsByOutcome[outcomeId] ?? []).length === 0

    setBusyKey(`create-output-${outcomeId}`)
    setErrorMessage(null)

    try {
      const created = await createOutput({
        outcome_id: outcomeId,
        description: draft.description,
        frequency_type: draft.frequency_type,
        frequency_value: draft.frequency_value,
        schedule_weekdays:
          draft.frequency_type === 'fixed_weekly' ? draft.schedule_weekdays : null,
        is_starter: isFirstOutput && draft.starter_applied,
      })

      setOutputs((previous) => [...previous, created])
      setDraftForOutcome(outcomeId, makeDefaultOutputDraft())
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create output'
      setErrorMessage(message)
    } finally {
      setBusyKey(null)
    }
  }

  function beginOutputEdit(output: OutputRow) {
    setEditingOutputId(output.id)
    setDraftForOutcome(output.id, outputToDraft(output))
  }

  function cancelOutputEdit(outputId: string) {
    setEditingOutputId((current) => (current === outputId ? null : current))
    setOutputDrafts((previous) => {
      const copy = { ...previous }
      delete copy[outputId]
      return copy
    })
  }

  async function saveOutputEdit(output: OutputRow) {
    const draft = ensureDraftForOutcome(output.id)

    if (!isOutputDraftValid(draft)) {
      setErrorMessage('Output update is incomplete. Add description and valid frequency.')
      return
    }

    setBusyKey(`save-output-${output.id}`)
    setErrorMessage(null)

    try {
      const updated = await updateOutput(output.id, {
        outcome_id: output.outcome_id,
        description: draft.description,
        frequency_type: draft.frequency_type,
        frequency_value: draft.frequency_value,
        schedule_weekdays:
          draft.frequency_type === 'fixed_weekly' ? draft.schedule_weekdays : null,
        is_starter: output.is_starter,
      })

      setOutputs((previous) => updateOutputInList(previous, updated))

      await logOutputChange({
        output_id: output.id,
        change_type: 'output_updated',
        old_value: {
          description: output.description,
          frequency_type: output.frequency_type,
          frequency_value: output.frequency_value,
          schedule_weekdays: output.schedule_weekdays,
        },
        new_value: {
          description: updated.description,
          frequency_type: updated.frequency_type,
          frequency_value: updated.frequency_value,
          schedule_weekdays: updated.schedule_weekdays,
        },
        reason: 'manual edit from outcomes screen',
      })

      cancelOutputEdit(output.id)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update output'
      setErrorMessage(message)
    } finally {
      setBusyKey(null)
    }
  }

  async function handleOutputStatus(output: OutputRow, status: OutputStatus) {
    setBusyKey(`output-status-${output.id}`)
    setErrorMessage(null)

    try {
      const updated = await setOutputStatus(output.id, status)
      setOutputs((previous) => updateOutputInList(previous, updated))

      await logOutputChange({
        output_id: output.id,
        change_type: 'status_change',
        old_value: { status: output.status },
        new_value: { status: updated.status },
        reason: 'manual status transition from outcomes screen',
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update output status'
      setErrorMessage(message)
    } finally {
      setBusyKey(null)
    }
  }

  if (loading) {
    return (
      <section className="stack">
        <header className="stack-sm">
          <p className="eyebrow">Outcomes & Outputs</p>
          <h1>Outcomes</h1>
        </header>
        <article className="panel">Loading outcomes...</article>
      </section>
    )
  }

  return (
    <section className="stack">
      <header className="stack-sm">
        <p className="eyebrow">Outcomes & Outputs</p>
        <h1>Outcomes</h1>
        <p className="muted">
          Create and manage outcomes/outputs with starter mode and status transitions.
        </p>
      </header>

      {errorMessage ? <p className="status-bad">{errorMessage}</p> : null}

      <article className="panel stack-sm">
        <h2>Create outcome</h2>

        <form className="field-grid" onSubmit={handleCreateOutcome}>
          <label className="form-row" htmlFor="outcome-title">
            Outcome title
            <input
              id="outcome-title"
              onChange={(event) =>
                setNewOutcome((previous) => ({ ...previous, title: event.target.value }))
              }
              required
              value={newOutcome.title}
            />
          </label>

          <label className="form-row" htmlFor="outcome-category">
            Category (optional)
            <input
              id="outcome-category"
              onChange={(event) =>
                setNewOutcome((previous) => ({ ...previous, category: event.target.value }))
              }
              value={newOutcome.category}
            />
          </label>

          <button className="btn" disabled={busyKey === 'create-outcome'} type="submit">
            {busyKey === 'create-outcome' ? 'Creating...' : 'Create outcome'}
          </button>
        </form>
      </article>

      <article className="panel stack-sm">
        <h2>Filter</h2>
        <div className="tag-row">
          {STATUS_FILTERS.map((item) => (
            <button
              className={`tag-btn${filter === item.value ? ' tag-btn-active' : ''}`}
              key={item.value}
              onClick={() => setFilter(item.value)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
      </article>

      <div className="stack">
        {visibleOutcomes.length === 0 ? (
          <article className="panel">No outcomes match this filter.</article>
        ) : null}

        {visibleOutcomes.map((outcome) => {
          const outcomeOutputs = outputsByOutcome[outcome.id] ?? []
          const createDraft = ensureDraftForOutcome(outcome.id)
          const showStarterSuggestion = outcomeOutputs.length === 0
          const starterSuggestion = showStarterSuggestion
            ? getStarterSuggestion(createDraft)
            : null

          return (
            <article className="panel stack-sm" key={outcome.id}>
              <header className="outcome-header">
                <div className="stack-xs">
                  <p className="pill">{outcome.status}</p>

                  {editingOutcomeId === outcome.id ? (
                    <div className="stack-xs">
                      <label className="form-row" htmlFor={`edit-outcome-title-${outcome.id}`}>
                        Title
                        <input
                          id={`edit-outcome-title-${outcome.id}`}
                          onChange={(event) =>
                            setEditingOutcomeDraft((previous) =>
                              previous
                                ? {
                                    ...previous,
                                    title: event.target.value,
                                  }
                                : previous,
                            )
                          }
                          value={editingOutcomeDraft?.title ?? ''}
                        />
                      </label>

                      <label className="form-row" htmlFor={`edit-outcome-category-${outcome.id}`}>
                        Category
                        <input
                          id={`edit-outcome-category-${outcome.id}`}
                          onChange={(event) =>
                            setEditingOutcomeDraft((previous) =>
                              previous
                                ? {
                                    ...previous,
                                    category: event.target.value,
                                  }
                                : previous,
                            )
                          }
                          value={editingOutcomeDraft?.category ?? ''}
                        />
                      </label>
                    </div>
                  ) : (
                    <>
                      <h2>{outcome.title}</h2>
                      <p className="muted">{outcome.category || 'No category'}</p>
                    </>
                  )}
                </div>

                <div className="actions-row">
                  {editingOutcomeId === outcome.id ? (
                    <>
                      <button
                        className="btn"
                        disabled={busyKey === `save-outcome-${outcome.id}`}
                        onClick={() => void saveOutcomeEdit(outcome.id)}
                        type="button"
                      >
                        {busyKey === `save-outcome-${outcome.id}` ? 'Saving...' : 'Save'}
                      </button>
                      <button className="btn btn-secondary" onClick={cancelOutcomeEdit} type="button">
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="btn btn-secondary"
                        onClick={() => beginOutcomeEdit(outcome)}
                        type="button"
                      >
                        Edit
                      </button>

                      {outcomeStatusActions(outcome.status).map((status) => (
                        <button
                          className="btn btn-secondary"
                          disabled={busyKey === `outcome-status-${outcome.id}`}
                          key={`${outcome.id}-${status}`}
                          onClick={() => void handleOutcomeStatus(outcome, status)}
                          type="button"
                        >
                          {statusButtonLabel(status)}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              </header>

              <section className="stack-sm">
                <h3>Outputs</h3>

                {outcomeOutputs.length === 0 ? (
                  <p className="muted">No outputs yet.</p>
                ) : (
                  <div className="stack-sm">
                    {outcomeOutputs.map((output) => {
                      const isEditing = editingOutputId === output.id
                      const draft = ensureDraftForOutcome(output.id)

                      return (
                        <div className="output-row" key={output.id}>
                          <div className="stack-xs">
                            <p>
                              <strong>{output.description}</strong>
                            </p>
                            <p className="muted">
                              {frequencyLabel(output)} · {output.status}
                              {output.is_starter ? ' · starter' : ''}
                            </p>
                          </div>

                          <div className="actions-row">
                            {isEditing ? (
                              <>
                                <button
                                  className="btn"
                                  disabled={busyKey === `save-output-${output.id}`}
                                  onClick={() => void saveOutputEdit(output)}
                                  type="button"
                                >
                                  {busyKey === `save-output-${output.id}` ? 'Saving...' : 'Save'}
                                </button>
                                <button
                                  className="btn btn-secondary"
                                  onClick={() => cancelOutputEdit(output.id)}
                                  type="button"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  className="btn btn-secondary"
                                  onClick={() => beginOutputEdit(output)}
                                  type="button"
                                >
                                  Edit
                                </button>

                                {outputStatusActions(output.status).map((status) => (
                                  <button
                                    className="btn btn-secondary"
                                    disabled={busyKey === `output-status-${output.id}`}
                                    key={`${output.id}-${status}`}
                                    onClick={() => void handleOutputStatus(output, status)}
                                    type="button"
                                  >
                                    {statusButtonLabel(status)}
                                  </button>
                                ))}
                              </>
                            )}
                          </div>

                          {isEditing ? (
                            <div className="stack-sm">
                              <label className="form-row" htmlFor={`edit-output-desc-${output.id}`}>
                                Description
                                <input
                                  id={`edit-output-desc-${output.id}`}
                                  onChange={(event) =>
                                    setDraftField(output.id, 'description', event.target.value)
                                  }
                                  value={draft.description}
                                />
                              </label>

                              <label className="form-row" htmlFor={`edit-output-frequency-${output.id}`}>
                                Frequency
                                <select
                                  id={`edit-output-frequency-${output.id}`}
                                  onChange={(event) =>
                                    setDraftField(
                                      output.id,
                                      'frequency_type',
                                      event.target.value as FrequencyType,
                                    )
                                  }
                                  value={draft.frequency_type}
                                >
                                  <option value="daily">Daily</option>
                                  <option value="flexible_weekly">Flexible X/week</option>
                                  <option value="fixed_weekly">Fixed days/week</option>
                                </select>
                              </label>

                              {draft.frequency_type === 'flexible_weekly' ? (
                                <label className="form-row" htmlFor={`edit-output-value-${output.id}`}>
                                  Target per week
                                  <input
                                    id={`edit-output-value-${output.id}`}
                                    max={7}
                                    min={1}
                                    onChange={(event) =>
                                      setDraftField(
                                        output.id,
                                        'frequency_value',
                                        Number(event.target.value),
                                      )
                                    }
                                    type="number"
                                    value={draft.frequency_value}
                                  />
                                </label>
                              ) : null}

                              {draft.frequency_type === 'fixed_weekly' ? (
                                <div className="stack-xs">
                                  <p className="muted">Select weekdays</p>
                                  <div className="weekday-row">
                                    {WEEKDAYS.map((day) => {
                                      const selected = draft.schedule_weekdays.includes(day.value)

                                      return (
                                        <button
                                          className={`chip${selected ? ' chip-active' : ''}`}
                                          key={`${output.id}-${day.value}`}
                                          onClick={() => toggleWeekday(output.id, day.value)}
                                          type="button"
                                        >
                                          {day.label}
                                        </button>
                                      )
                                    })}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>

              <section className="stack-sm">
                <h3>Add output</h3>

                <div className="stack-sm">
                  <label className="form-row" htmlFor={`new-output-desc-${outcome.id}`}>
                    Description
                    <input
                      id={`new-output-desc-${outcome.id}`}
                      onChange={(event) =>
                        setDraftField(outcome.id, 'description', event.target.value)
                      }
                      value={createDraft.description}
                    />
                  </label>

                  <label className="form-row" htmlFor={`new-output-frequency-${outcome.id}`}>
                    Frequency
                    <select
                      id={`new-output-frequency-${outcome.id}`}
                      onChange={(event) =>
                        setDraftField(
                          outcome.id,
                          'frequency_type',
                          event.target.value as FrequencyType,
                        )
                      }
                      value={createDraft.frequency_type}
                    >
                      <option value="daily">Daily</option>
                      <option value="flexible_weekly">Flexible X/week</option>
                      <option value="fixed_weekly">Fixed days/week</option>
                    </select>
                  </label>

                  {createDraft.frequency_type === 'flexible_weekly' ? (
                    <label className="form-row" htmlFor={`new-output-value-${outcome.id}`}>
                      Target per week
                      <input
                        id={`new-output-value-${outcome.id}`}
                        max={7}
                        min={1}
                        onChange={(event) =>
                          setDraftField(
                            outcome.id,
                            'frequency_value',
                            Number(event.target.value),
                          )
                        }
                        type="number"
                        value={createDraft.frequency_value}
                      />
                    </label>
                  ) : null}

                  {createDraft.frequency_type === 'fixed_weekly' ? (
                    <div className="stack-xs">
                      <p className="muted">Select weekdays</p>
                      <div className="weekday-row">
                        {WEEKDAYS.map((day) => {
                          const selected = createDraft.schedule_weekdays.includes(day.value)

                          return (
                            <button
                              className={`chip${selected ? ' chip-active' : ''}`}
                              key={`${outcome.id}-${day.value}`}
                              onClick={() => toggleWeekday(outcome.id, day.value)}
                              type="button"
                            >
                              {day.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ) : null}

                  {starterSuggestion ? (
                    <div className="starter-card">
                      <p className="muted">{starterSuggestion.reason}</p>
                      <p className="hint">{starterSuggestionText(starterSuggestion.draft)}</p>
                      <button
                        className="btn btn-secondary"
                        onClick={() =>
                          setDraftForOutcome(outcome.id, {
                            ...starterSuggestion.draft,
                            starter_applied: true,
                          })
                        }
                        type="button"
                      >
                        Apply starter suggestion
                      </button>
                    </div>
                  ) : null}

                  <button
                    className="btn"
                    disabled={busyKey === `create-output-${outcome.id}`}
                    onClick={() => void handleCreateOutput(outcome.id)}
                    type="button"
                  >
                    {busyKey === `create-output-${outcome.id}` ? 'Creating...' : 'Create output'}
                  </button>
                </div>
              </section>
            </article>
          )
        })}
      </div>
    </section>
  )
}
