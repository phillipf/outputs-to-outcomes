import type { FrequencyType, Weekday } from '../outcomes/types'

export interface DashboardTodayLog {
  completed: number
  total: number
  notes: string | null
}

export interface DashboardWeeklyProgress {
  completed: number
  target: number
  rate: number
  target_met: boolean
}

export interface DashboardOutput {
  id: string
  description: string
  frequency_type: FrequencyType
  frequency_value: number
  schedule_weekdays: Weekday[] | null
  is_starter: boolean
  scheduled_today: boolean
  today_log: DashboardTodayLog | null
  weekly_progress: DashboardWeeklyProgress
}

export interface DashboardOutcome {
  id: string
  title: string
  category: string | null
  outputs: DashboardOutput[]
}

export interface DailyDashboardPayload {
  date: string
  week_start: string
  week_end: string
  start_of_week: 0 | 1
  missed_yesterday_count: number
  outcomes: DashboardOutcome[]
}

export interface ActionLogInput {
  outputId: string
  actionDate: string
  completed: number
  total: number
  notes: string
}
