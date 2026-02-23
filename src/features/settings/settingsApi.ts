import { supabase } from '../../lib/supabase'

export interface UserSettingsRow {
  id: string
  user_id: string
  start_of_week: 0 | 1
  reminders_enabled: boolean
  daily_reminder_time: string | null
  weekly_review_reminder_time: string | null
}

function isNoRowsError(error: { code?: string } | null): boolean {
  return error?.code === 'PGRST116'
}

export async function fetchOrCreateUserSettings(): Promise<UserSettingsRow> {
  const { data, error } = await supabase.from('user_settings').select('*').maybeSingle()

  if (error && !isNoRowsError(error)) {
    throw new Error(error.message)
  }

  if (data) {
    return data as UserSettingsRow
  }

  const { data: inserted, error: insertError } = await supabase
    .from('user_settings')
    .insert({
      start_of_week: 1,
      reminders_enabled: false,
      daily_reminder_time: null,
      weekly_review_reminder_time: null,
    })
    .select('*')
    .single()

  if (insertError) {
    throw new Error(insertError.message)
  }

  if (!inserted) {
    throw new Error('Settings row was not returned')
  }

  return inserted as UserSettingsRow
}

export async function updateUserSettings(input: {
  id: string
  start_of_week: 0 | 1
  reminders_enabled: boolean
  daily_reminder_time: string | null
  weekly_review_reminder_time: string | null
}): Promise<UserSettingsRow> {
  const { data, error } = await supabase
    .from('user_settings')
    .update({
      start_of_week: input.start_of_week,
      reminders_enabled: input.reminders_enabled,
      daily_reminder_time: input.daily_reminder_time,
      weekly_review_reminder_time: input.weekly_review_reminder_time,
    })
    .eq('id', input.id)
    .select('*')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  if (!data) {
    throw new Error('Updated settings row was not returned')
  }

  return data as UserSettingsRow
}

export async function purgeAllAppData() {
  const { error } = await supabase.rpc('purge_my_data')

  if (error) {
    throw new Error(error.message)
  }
}
