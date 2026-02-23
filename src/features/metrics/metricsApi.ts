import { supabase } from '../../lib/supabase'
import type { MetricsPayload, MetricEntryRow, MetricRow } from './types'

export async function fetchMetricsPayload(): Promise<MetricsPayload> {
  const [outcomesResult, metricsResult, entriesResult] = await Promise.all([
    supabase.from('outcomes').select('*').eq('status', 'active').order('created_at', { ascending: false }),
    supabase.from('metrics').select('*').order('created_at', { ascending: false }),
    supabase.from('metric_entries').select('*').order('entry_date', { ascending: true }),
  ])

  if (outcomesResult.error) {
    throw new Error(outcomesResult.error.message)
  }

  if (metricsResult.error) {
    throw new Error(metricsResult.error.message)
  }

  if (entriesResult.error) {
    throw new Error(entriesResult.error.message)
  }

  const metrics = (metricsResult.data ?? []) as MetricRow[]
  const metricIds = new Set(metrics.map((metric) => metric.id))

  return {
    outcomes: outcomesResult.data ?? [],
    metrics,
    entries: ((entriesResult.data ?? []) as MetricEntryRow[]).filter((entry) => metricIds.has(entry.metric_id)),
  }
}

export async function createMetric(input: {
  outcomeId: string
  name: string
  unit: string
  isPrimary: boolean
}): Promise<MetricRow> {
  if (input.isPrimary) {
    const { error: resetError } = await supabase
      .from('metrics')
      .update({ is_primary: false })
      .eq('outcome_id', input.outcomeId)

    if (resetError) {
      throw new Error(resetError.message)
    }
  }

  const { data, error } = await supabase
    .from('metrics')
    .insert({
      outcome_id: input.outcomeId,
      name: input.name.trim(),
      unit: input.unit.trim(),
      is_primary: input.isPrimary,
    })
    .select('*')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  if (!data) {
    throw new Error('Metric was not returned')
  }

  return data as MetricRow
}

export async function updateMetric(
  metricId: string,
  input: {
    outcomeId: string
    name: string
    unit: string
    isPrimary: boolean
  },
): Promise<MetricRow> {
  if (input.isPrimary) {
    const { error: resetError } = await supabase
      .from('metrics')
      .update({ is_primary: false })
      .eq('outcome_id', input.outcomeId)
      .neq('id', metricId)

    if (resetError) {
      throw new Error(resetError.message)
    }
  }

  const { data, error } = await supabase
    .from('metrics')
    .update({
      outcome_id: input.outcomeId,
      name: input.name.trim(),
      unit: input.unit.trim(),
      is_primary: input.isPrimary,
    })
    .eq('id', metricId)
    .select('*')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  if (!data) {
    throw new Error('Updated metric was not returned')
  }

  return data as MetricRow
}

export async function deleteMetric(metricId: string): Promise<void> {
  const { error } = await supabase.from('metrics').delete().eq('id', metricId)

  if (error) {
    throw new Error(error.message)
  }
}

export async function createMetricEntry(input: {
  metricId: string
  entryDate: string
  value: number
}): Promise<MetricEntryRow> {
  const { data, error } = await supabase
    .from('metric_entries')
    .insert({
      metric_id: input.metricId,
      entry_date: input.entryDate,
      value: input.value,
    })
    .select('*')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  if (!data) {
    throw new Error('Metric entry was not returned')
  }

  return data as MetricEntryRow
}

export async function updateMetricEntry(
  entryId: string,
  input: {
    entryDate: string
    value: number
  },
): Promise<MetricEntryRow> {
  const { data, error } = await supabase
    .from('metric_entries')
    .update({
      entry_date: input.entryDate,
      value: input.value,
    })
    .eq('id', entryId)
    .select('*')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  if (!data) {
    throw new Error('Updated metric entry was not returned')
  }

  return data as MetricEntryRow
}

export async function deleteMetricEntry(entryId: string): Promise<void> {
  const { error } = await supabase.from('metric_entries').delete().eq('id', entryId)

  if (error) {
    throw new Error(error.message)
  }
}
