export type OutcomeStatus = 'active' | 'archived' | 'retired'
export type OutputStatus = 'active' | 'paused' | 'retired'
export type FrequencyType = 'daily' | 'fixed_weekly' | 'flexible_weekly'

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export interface OutcomeRow {
  id: string
  user_id: string
  title: string
  category: string | null
  status: OutcomeStatus
  created_at: string
  updated_at: string
}

export interface OutputRow {
  id: string
  user_id: string
  outcome_id: string
  description: string
  frequency_type: FrequencyType
  frequency_value: number
  schedule_weekdays: Weekday[] | null
  is_starter: boolean
  status: OutputStatus
  created_at: string
  updated_at: string
}

export interface OutputDraft {
  description: string
  frequency_type: FrequencyType
  frequency_value: number
  schedule_weekdays: Weekday[]
  starter_applied: boolean
}
