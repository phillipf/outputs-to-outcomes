import { supabase } from '../../lib/supabase'
import type { ActionLogInput, DailyDashboardPayload } from './types'

export async function fetchDailyDashboard(targetDate: string): Promise<DailyDashboardPayload> {
  const { data, error } = await supabase.rpc('get_daily_dashboard', {
    p_target_date: targetDate,
  })

  if (error) {
    throw new Error(error.message)
  }

  return data as DailyDashboardPayload
}

export async function saveActionLog(input: ActionLogInput): Promise<void> {
  const completed = Math.max(0, Number(input.completed) || 0)
  const total = Math.max(0, Number(input.total) || 0)

  const { data: existing, error: lookupError } = await supabase
    .from('action_logs')
    .select('id')
    .eq('output_id', input.outputId)
    .eq('action_date', input.actionDate)
    .maybeSingle()

  if (lookupError) {
    throw new Error(lookupError.message)
  }

  if (existing?.id) {
    const { error: updateError } = await supabase
      .from('action_logs')
      .update({
        completed,
        total,
        notes: input.notes.trim() ? input.notes.trim() : null,
      })
      .eq('id', existing.id)

    if (updateError) {
      throw new Error(updateError.message)
    }

    return
  }

  const { error: insertError } = await supabase.from('action_logs').insert({
    output_id: input.outputId,
    action_date: input.actionDate,
    completed,
    total,
    notes: input.notes.trim() ? input.notes.trim() : null,
  })

  if (insertError) {
    throw new Error(insertError.message)
  }
}
