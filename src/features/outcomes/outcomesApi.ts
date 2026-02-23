import { supabase } from '../../lib/supabase'
import type {
  FrequencyType,
  OutcomeRow,
  OutcomeStatus,
  OutputRow,
  OutputStatus,
  Weekday,
} from './types'

type OutcomeInput = {
  title: string
  category: string | null
}

type OutputInput = {
  outcome_id: string
  description: string
  frequency_type: FrequencyType
  frequency_value: number
  schedule_weekdays: Weekday[] | null
  is_starter: boolean
}

function normalizeOutputInput(input: OutputInput): OutputInput {
  if (input.frequency_type === 'daily') {
    return {
      ...input,
      frequency_value: 1,
      schedule_weekdays: null,
    }
  }

  if (input.frequency_type === 'fixed_weekly') {
    const days = [...new Set(input.schedule_weekdays ?? [])].sort((a, b) => a - b) as Weekday[]

    return {
      ...input,
      frequency_value: days.length,
      schedule_weekdays: days,
    }
  }

  return {
    ...input,
    frequency_value: Math.max(1, Math.min(7, input.frequency_value)),
    schedule_weekdays: null,
  }
}

function requireData<T>(value: T | null, message: string): T {
  if (value === null) {
    throw new Error(message)
  }

  return value
}

export async function fetchOutcomesAndOutputs() {
  const { data: outcomes, error: outcomesError } = await supabase
    .from('outcomes')
    .select('*')
    .order('created_at', { ascending: false })

  if (outcomesError) {
    throw new Error(outcomesError.message)
  }

  const { data: outputs, error: outputsError } = await supabase
    .from('outputs')
    .select('*')
    .order('created_at', { ascending: true })

  if (outputsError) {
    throw new Error(outputsError.message)
  }

  return {
    outcomes: (outcomes ?? []) as OutcomeRow[],
    outputs: (outputs ?? []) as OutputRow[],
  }
}

export async function createOutcome(input: OutcomeInput): Promise<OutcomeRow> {
  const { data, error } = await supabase
    .from('outcomes')
    .insert({
      title: input.title.trim(),
      category: input.category?.trim() || null,
    })
    .select('*')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return requireData(data as OutcomeRow | null, 'Outcome was not returned')
}

export async function updateOutcome(
  outcomeId: string,
  input: OutcomeInput,
): Promise<OutcomeRow> {
  const { data, error } = await supabase
    .from('outcomes')
    .update({
      title: input.title.trim(),
      category: input.category?.trim() || null,
    })
    .eq('id', outcomeId)
    .select('*')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return requireData(data as OutcomeRow | null, 'Updated outcome was not returned')
}

export async function setOutcomeStatus(
  outcomeId: string,
  status: OutcomeStatus,
): Promise<OutcomeRow> {
  const { data, error } = await supabase
    .from('outcomes')
    .update({ status })
    .eq('id', outcomeId)
    .select('*')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return requireData(data as OutcomeRow | null, 'Updated outcome status was not returned')
}

export async function createOutput(input: OutputInput): Promise<OutputRow> {
  const payload = normalizeOutputInput(input)

  const { data, error } = await supabase
    .from('outputs')
    .insert(payload)
    .select('*')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return requireData(data as OutputRow | null, 'Output was not returned')
}

export async function updateOutput(
  outputId: string,
  input: OutputInput,
): Promise<OutputRow> {
  const payload = normalizeOutputInput(input)

  const { data, error } = await supabase
    .from('outputs')
    .update(payload)
    .eq('id', outputId)
    .select('*')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return requireData(data as OutputRow | null, 'Updated output was not returned')
}

export async function setOutputStatus(
  outputId: string,
  status: OutputStatus,
): Promise<OutputRow> {
  const { data, error } = await supabase
    .from('outputs')
    .update({ status })
    .eq('id', outputId)
    .select('*')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return requireData(data as OutputRow | null, 'Updated output status was not returned')
}

export async function logOutputChange(params: {
  output_id: string
  change_type: string
  old_value: Record<string, unknown>
  new_value: Record<string, unknown>
  reason?: string
}) {
  const { error } = await supabase.from('output_change_logs').insert({
    output_id: params.output_id,
    change_type: params.change_type,
    old_value: params.old_value,
    new_value: params.new_value,
    reason: params.reason ?? null,
  })

  if (error) {
    throw new Error(error.message)
  }
}
