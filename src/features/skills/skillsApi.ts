import { supabase } from '../../lib/supabase'
import { isSkillEligibleForGraduation } from './priority'
import type { SkillItemRow, SkillLogRow, SkillStage, SkillSummary } from './types'
import { computeWeeklySkillSummaryFromData } from './weeklySummary'

type SkillDraftInput = {
  outcomeId: string
  name: string
  initialConfidence: number
  targetLabel?: string
  targetValue?: number
}

type SkillLogDraftInput = {
  skillItemId: string
  confidence: number
  targetResult: number | null
}

type SkillLogSaveResult = {
  createdSkillIds: string[]
}

function requireData<T>(value: T | null, message: string): T {
  if (value === null) {
    throw new Error(message)
  }

  return value
}

function toSkillMutationError(error: {
  code?: string
  message: string
  details?: string | null
}): Error {
  const details = error.details ?? ''
  const duplicateLiveName =
    error.code === '23505' &&
    (error.message.includes('skill_items_outcome_name_live_unique_idx') ||
      details.includes('skill_items_outcome_name_live_unique_idx'))

  if (duplicateLiveName) {
    return new Error('A live skill with this name already exists for this outcome.')
  }

  return new Error(error.message)
}

function normalizeTargetLabel(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function normalizeTargetValue(value: number | undefined): number | null {
  if (value === undefined || Number.isNaN(value)) {
    return null
  }

  return value
}

function formatDateLocal(date: Date): string {
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
  return formatDateLocal(date)
}

export async function fetchSkillsForOutcome(
  outcomeId: string,
): Promise<{ skills: SkillItemRow[]; logs: SkillLogRow[] }> {
  const { data: skills, error: skillsError } = await supabase
    .from('skill_items')
    .select('*')
    .eq('outcome_id', outcomeId)
    .order('created_at', { ascending: true })

  if (skillsError) {
    throw new Error(skillsError.message)
  }

  const skillIds = (skills ?? []).map((item) => item.id)

  if (!skillIds.length) {
    return {
      skills: [],
      logs: [],
    }
  }

  const { data: logs, error: logsError } = await supabase
    .from('skill_logs')
    .select('*')
    .in('skill_item_id', skillIds)
    .order('logged_at', { ascending: false })

  if (logsError) {
    throw new Error(logsError.message)
  }

  return {
    skills: (skills ?? []) as SkillItemRow[],
    logs: (logs ?? []) as SkillLogRow[],
  }
}

export async function fetchSkillsForOutcomes(
  outcomeIds: string[],
): Promise<{ skills: SkillItemRow[]; logs: SkillLogRow[] }> {
  if (!outcomeIds.length) {
    return {
      skills: [],
      logs: [],
    }
  }

  const { data: skills, error: skillsError } = await supabase
    .from('skill_items')
    .select('*')
    .in('outcome_id', outcomeIds)
    .in('stage', ['active', 'review'])
    .order('created_at', { ascending: true })

  if (skillsError) {
    throw new Error(skillsError.message)
  }

  const skillIds = (skills ?? []).map((item) => item.id)

  if (!skillIds.length) {
    return {
      skills: (skills ?? []) as SkillItemRow[],
      logs: [],
    }
  }

  const { data: logs, error: logsError } = await supabase
    .from('skill_logs')
    .select('*')
    .in('skill_item_id', skillIds)
    .order('logged_at', { ascending: false })

  if (logsError) {
    throw new Error(logsError.message)
  }

  return {
    skills: (skills ?? []) as SkillItemRow[],
    logs: (logs ?? []) as SkillLogRow[],
  }
}

export async function fetchSkillById(skillId: string): Promise<SkillItemRow> {
  const { data, error } = await supabase
    .from('skill_items')
    .select('*')
    .eq('id', skillId)
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return requireData(data as SkillItemRow | null, 'Skill item not found')
}

export async function fetchSkillLogsForSkill(skillId: string): Promise<SkillLogRow[]> {
  const { data, error } = await supabase
    .from('skill_logs')
    .select('*')
    .eq('skill_item_id', skillId)
    .order('logged_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as SkillLogRow[]
}

export async function fetchSkillLogsByActionIds(
  actionLogIds: string[],
): Promise<SkillLogRow[]> {
  if (!actionLogIds.length) {
    return []
  }

  const { data, error } = await supabase
    .from('skill_logs')
    .select('*')
    .in('action_log_id', actionLogIds)

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as SkillLogRow[]
}

export async function fetchSkillActionContext(actionLogIds: string[]): Promise<
  Record<
    string,
    {
      actionDate: string
      outputId: string
      outputDescription: string | null
    }
  >
> {
  if (!actionLogIds.length) {
    return {}
  }

  const { data: actionLogs, error: actionLogsError } = await supabase
    .from('action_logs')
    .select('id, action_date, output_id')
    .in('id', actionLogIds)

  if (actionLogsError) {
    throw new Error(actionLogsError.message)
  }

  const outputIds = [...new Set((actionLogs ?? []).map((item) => item.output_id))]

  const outputsById: Record<string, string> = {}

  if (outputIds.length) {
    const { data: outputs, error: outputsError } = await supabase
      .from('outputs')
      .select('id, description')
      .in('id', outputIds)

    if (outputsError) {
      throw new Error(outputsError.message)
    }

    ;(outputs ?? []).forEach((output) => {
      outputsById[output.id] = output.description
    })
  }

  return (actionLogs ?? []).reduce<Record<string, { actionDate: string; outputId: string; outputDescription: string | null }>>(
    (acc, log) => {
      acc[log.id] = {
        actionDate: log.action_date,
        outputId: log.output_id,
        outputDescription: outputsById[log.output_id] ?? null,
      }

      return acc
    },
    {},
  )
}

export async function createSkillItem(input: SkillDraftInput): Promise<SkillItemRow> {
  const targetLabel = normalizeTargetLabel(input.targetLabel)
  const targetValue = normalizeTargetValue(input.targetValue)

  const { data, error } = await supabase
    .from('skill_items')
    .insert({
      outcome_id: input.outcomeId,
      name: input.name.trim(),
      initial_confidence: input.initialConfidence,
      target_label: targetLabel,
      target_value: targetValue,
    })
    .select('*')
    .single()

  if (error) {
    throw toSkillMutationError(error)
  }

  return requireData(data as SkillItemRow | null, 'Skill item was not returned')
}

export async function updateSkillItem(
  skillId: string,
  input: {
    name: string
    targetLabel?: string
    targetValue?: number
    initialConfidence: number
  },
): Promise<SkillItemRow> {
  const targetLabel = normalizeTargetLabel(input.targetLabel)
  const targetValue = normalizeTargetValue(input.targetValue)

  const { data, error } = await supabase
    .from('skill_items')
    .update({
      name: input.name.trim(),
      target_label: targetLabel,
      target_value: targetValue,
      initial_confidence: input.initialConfidence,
    })
    .eq('id', skillId)
    .select('*')
    .single()

  if (error) {
    throw toSkillMutationError(error)
  }

  return requireData(data as SkillItemRow | null, 'Updated skill item was not returned')
}

export async function setSkillStage(skillId: string, stage: SkillStage): Promise<SkillItemRow> {
  const updates: Partial<SkillItemRow> = {
    stage,
  }

  if (stage === 'review') {
    updates.graduation_suppressed_at = null
  }

  const { data, error } = await supabase
    .from('skill_items')
    .update(updates)
    .eq('id', skillId)
    .select('*')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return requireData(data as SkillItemRow | null, 'Updated skill stage was not returned')
}

export async function suppressSkillGraduation(skillId: string): Promise<void> {
  const { error } = await supabase
    .from('skill_items')
    .update({ graduation_suppressed_at: new Date().toISOString() })
    .eq('id', skillId)

  if (error) {
    throw new Error(error.message)
  }
}

export async function replaceSkillLogsForAction(params: {
  actionLogId: string
  entries: SkillLogDraftInput[]
}): Promise<SkillLogSaveResult> {
  const skillIds = params.entries.map((entry) => entry.skillItemId)

  const { data: existingRows, error: existingError } = await supabase
    .from('skill_logs')
    .select('*')
    .eq('action_log_id', params.actionLogId)

  if (existingError) {
    throw new Error(existingError.message)
  }

  const existingMap = new Map(
    ((existingRows ?? []) as SkillLogRow[]).map((row) => [row.skill_item_id, row]),
  )

  const createdSkillIds: string[] = []

  for (const entry of params.entries) {
    const existing = existingMap.get(entry.skillItemId)

    if (existing) {
      const { error: updateError } = await supabase
        .from('skill_logs')
        .update({
          confidence: entry.confidence,
          target_result: entry.targetResult,
        })
        .eq('id', existing.id)

      if (updateError) {
        throw new Error(updateError.message)
      }
      continue
    }

    const { error: insertError } = await supabase.from('skill_logs').insert({
      skill_item_id: entry.skillItemId,
      action_log_id: params.actionLogId,
      confidence: entry.confidence,
      target_result: entry.targetResult,
      logged_at: new Date().toISOString(),
    })

    if (insertError) {
      throw new Error(insertError.message)
    }

    createdSkillIds.push(entry.skillItemId)
  }

  const skillIdsToKeep = new Set(skillIds)
  const staleIds = ((existingRows ?? []) as SkillLogRow[])
    .filter((row) => !skillIdsToKeep.has(row.skill_item_id))
    .map((row) => row.id)

  if (staleIds.length) {
    const { error: deleteError } = await supabase
      .from('skill_logs')
      .delete()
      .in('id', staleIds)

    if (deleteError) {
      throw new Error(deleteError.message)
    }
  }

  return {
    createdSkillIds,
  }
}

export async function deleteSkillLogsByActionLogId(actionLogId: string): Promise<void> {
  const { error } = await supabase
    .from('skill_logs')
    .delete()
    .eq('action_log_id', actionLogId)

  if (error) {
    throw new Error(error.message)
  }
}

export async function checkGraduationEligibility(skillId: string): Promise<boolean> {
  const skill = await fetchSkillById(skillId)

  if (skill.stage !== 'active') {
    return false
  }

  const { data, error } = await supabase
    .from('skill_logs')
    .select('*')
    .eq('skill_item_id', skillId)
    .order('logged_at', { ascending: false })
    .limit(3)

  if (error) {
    throw new Error(error.message)
  }

  const logs = (data ?? []) as SkillLogRow[]

  return isSkillEligibleForGraduation(skill, logs)
}

export async function computeWeeklySkillSummaryByOutcome(params: {
  outcomeIds: string[]
  weekStart: string
  weekEnd: string
}): Promise<Record<string, SkillSummary>> {
  if (!params.outcomeIds.length) {
    return {}
  }

  const { data: skillItems, error: skillItemsError } = await supabase
    .from('skill_items')
    .select('*')
    .in('outcome_id', params.outcomeIds)

  if (skillItemsError) {
    throw new Error(skillItemsError.message)
  }

  const skills = (skillItems ?? []) as SkillItemRow[]
  const skillIds = skills.map((skill) => skill.id)

  if (!skillIds.length) {
    return params.outcomeIds.reduce<Record<string, SkillSummary>>((acc, outcomeId) => {
      acc[outcomeId] = {
        skillsWorkedCount: 0,
        averageConfidenceDelta: null,
      }
      return acc
    }, {})
  }

  const inclusiveEnd = addDays(params.weekEnd, 1)

  const { data: allLogs, error: logsError } = await supabase
    .from('skill_logs')
    .select('*')
    .in('skill_item_id', skillIds)
    .lt('logged_at', `${inclusiveEnd}T00:00:00.000Z`)
    .order('logged_at', { ascending: false })

  if (logsError) {
    throw new Error(logsError.message)
  }

  return computeWeeklySkillSummaryFromData({
    outcomeIds: params.outcomeIds,
    weekStart: params.weekStart,
    weekEnd: params.weekEnd,
    skills,
    logs: (allLogs ?? []) as SkillLogRow[],
  })
}
