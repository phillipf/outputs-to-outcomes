import type { OutcomeRow } from '../outcomes/types'

export interface MetricRow {
  id: string
  user_id: string
  outcome_id: string
  name: string
  unit: string
  is_primary: boolean
  created_at: string
  updated_at: string
}

export interface MetricEntryRow {
  id: string
  user_id: string
  metric_id: string
  entry_date: string
  value: number
  created_at: string
  updated_at: string
}

export interface MetricsPayload {
  outcomes: OutcomeRow[]
  metrics: MetricRow[]
  entries: MetricEntryRow[]
}
