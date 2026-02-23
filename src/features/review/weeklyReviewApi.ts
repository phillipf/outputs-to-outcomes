import { supabase } from '../../lib/supabase'
import type { OutcomeRow, OutputRow } from '../outcomes/types'

export type ActionLogRow = {
  id: string
  output_id: string
  action_date: string
  completed: number
  total: number
  notes: string | null
}

export type ShortfallReason =
  | 'time'
  | 'energy'
  | 'motivation'
  | 'external_blocker'
  | 'forgot'
  | 'other'

export type ShortfallTagRow = {
  id: string
  output_id: string
  occurrence_date: string | null
  week_start: string | null
  reason: ShortfallReason
  other_text: string | null
}

export type ReflectionRow = {
  id: string
  outcome_id: string
  period_start: string
  responses: {
    what_worked?: string
    what_didnt?: string
    what_to_change?: string
  }
}

export type WeeklyReviewPayload = {
  weekStart: string
  weekEnd: string
  startOfWeek: 0 | 1
  outcomes: OutcomeRow[]
  outputs: OutputRow[]
  actionLogs: ActionLogRow[]
  shortfallTags: ShortfallTagRow[]
  reflections: ReflectionRow[]
}

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

function weekStartFor(anchorDate: string, startOfWeek: 0 | 1): string {
  const date = parseDate(anchorDate)
  const day = date.getDay()
  const offset = (day - startOfWeek + 7) % 7
  date.setDate(date.getDate() - offset)
  return toDateInputValue(date)
}

export async function fetchWeeklyReview(anchorDate: string): Promise<WeeklyReviewPayload> {
  const { data: setting, error: settingError } = await supabase
    .from('user_settings')
    .select('start_of_week')
    .maybeSingle()

  if (settingError) {
    throw new Error(settingError.message)
  }

  const startOfWeek = (setting?.start_of_week ?? 1) as 0 | 1
  const weekStart = weekStartFor(anchorDate, startOfWeek)
  const weekEnd = addDays(weekStart, 6)

  const { data: outcomes, error: outcomesError } = await supabase
    .from('outcomes')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  if (outcomesError) {
    throw new Error(outcomesError.message)
  }

  const outcomeIds = (outcomes ?? []).map((item) => item.id)

  if (!outcomeIds.length) {
    return {
      weekStart,
      weekEnd,
      startOfWeek,
      outcomes: [],
      outputs: [],
      actionLogs: [],
      shortfallTags: [],
      reflections: [],
    }
  }

  const [outputsResult, actionLogsResult, shortfallsResult, reflectionsResult] = await Promise.all([
    supabase
      .from('outputs')
      .select('*')
      .in('outcome_id', outcomeIds)
      .eq('status', 'active')
      .order('created_at', { ascending: true }),
    supabase
      .from('action_logs')
      .select('id, output_id, action_date, completed, total, notes')
      .gte('action_date', weekStart)
      .lte('action_date', weekEnd),
    supabase
      .from('shortfall_tags')
      .select('id, output_id, occurrence_date, week_start, reason, other_text')
      .or(`and(occurrence_date.gte.${weekStart},occurrence_date.lte.${weekEnd}),week_start.eq.${weekStart}`),
    supabase
      .from('reflections')
      .select('id, outcome_id, period_start, responses')
      .eq('period_type', 'weekly')
      .eq('period_start', weekStart)
      .in('outcome_id', outcomeIds),
  ])

  if (outputsResult.error) {
    throw new Error(outputsResult.error.message)
  }

  if (actionLogsResult.error) {
    throw new Error(actionLogsResult.error.message)
  }

  if (shortfallsResult.error) {
    throw new Error(shortfallsResult.error.message)
  }

  if (reflectionsResult.error) {
    throw new Error(reflectionsResult.error.message)
  }

  const outputIds = (outputsResult.data ?? []).map((item) => item.id)

  return {
    weekStart,
    weekEnd,
    startOfWeek,
    outcomes: (outcomes ?? []) as OutcomeRow[],
    outputs: ((outputsResult.data ?? []) as OutputRow[]).filter((item) => outputIds.includes(item.id)),
    actionLogs: ((actionLogsResult.data ?? []) as ActionLogRow[]).filter((item) =>
      outputIds.includes(item.output_id),
    ),
    shortfallTags: ((shortfallsResult.data ?? []) as ShortfallTagRow[]).filter((item) =>
      outputIds.includes(item.output_id),
    ),
    reflections: (reflectionsResult.data ?? []) as ReflectionRow[],
  }
}

export async function saveShortfallTag(params: {
  outputId: string
  occurrenceDate?: string
  weekStart?: string
  reason: ShortfallReason
  otherText: string
}) {
  if (!params.occurrenceDate && !params.weekStart) {
    throw new Error('Either occurrenceDate or weekStart is required')
  }

  if (params.reason === 'other' && !params.otherText.trim()) {
    throw new Error('Other reason requires notes')
  }

  const lookup = supabase
    .from('shortfall_tags')
    .select('id')
    .eq('output_id', params.outputId)
    .eq(params.occurrenceDate ? 'occurrence_date' : 'week_start', params.occurrenceDate ?? params.weekStart)
    .maybeSingle()

  const { data: existing, error: lookupError } = await lookup

  if (lookupError) {
    throw new Error(lookupError.message)
  }

  const payload = {
    reason: params.reason,
    other_text: params.reason === 'other' ? params.otherText.trim() : null,
  }

  if (existing?.id) {
    const { error: updateError } = await supabase
      .from('shortfall_tags')
      .update(payload)
      .eq('id', existing.id)

    if (updateError) {
      throw new Error(updateError.message)
    }

    return
  }

  const { error: insertError } = await supabase.from('shortfall_tags').insert({
    output_id: params.outputId,
    occurrence_date: params.occurrenceDate ?? null,
    week_start: params.weekStart ?? null,
    ...payload,
  })

  if (insertError) {
    throw new Error(insertError.message)
  }
}

export async function saveWeeklyReflection(params: {
  outcomeId: string
  weekStart: string
  responses: {
    what_worked: string
    what_didnt: string
    what_to_change: string
  }
}) {
  const { data: existing, error: lookupError } = await supabase
    .from('reflections')
    .select('id')
    .eq('outcome_id', params.outcomeId)
    .eq('period_type', 'weekly')
    .eq('period_start', params.weekStart)
    .maybeSingle()

  if (lookupError) {
    throw new Error(lookupError.message)
  }

  if (existing?.id) {
    const { error: updateError } = await supabase
      .from('reflections')
      .update({ responses: params.responses })
      .eq('id', existing.id)

    if (updateError) {
      throw new Error(updateError.message)
    }

    return
  }

  const { error: insertError } = await supabase.from('reflections').insert({
    outcome_id: params.outcomeId,
    period_type: 'weekly',
    period_start: params.weekStart,
    responses: params.responses,
  })

  if (insertError) {
    throw new Error(insertError.message)
  }
}
