import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SkillItemRow, SkillLogRow } from './types'

const { mockFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: mockFrom,
  },
}))

import {
  createSkillItem,
  replaceSkillLogsForAction,
  setSkillStage,
  updateSkillItem,
} from './skillsApi'

function buildSkill(overrides: Partial<SkillItemRow> = {}): SkillItemRow {
  return {
    id: 'skill-1',
    user_id: 'user-1',
    outcome_id: 'outcome-1',
    name: 'Skill',
    stage: 'active',
    target_label: null,
    target_value: null,
    initial_confidence: 1,
    graduation_suppressed_at: null,
    created_at: '2026-02-20T00:00:00.000Z',
    updated_at: '2026-02-20T00:00:00.000Z',
    ...overrides,
  }
}

function buildLog(overrides: Partial<SkillLogRow> & Pick<SkillLogRow, 'id' | 'skill_item_id'>): SkillLogRow {
  const baseTimestamp = '2026-02-22T00:00:00.000Z'
  const { id, skill_item_id, ...rest } = overrides

  return {
    id,
    user_id: 'user-1',
    skill_item_id,
    action_log_id: 'action-1',
    confidence: 3,
    target_result: null,
    logged_at: baseTimestamp,
    created_at: baseTimestamp,
    updated_at: baseTimestamp,
    ...rest,
  }
}

beforeEach(() => {
  mockFrom.mockReset()
})

describe('skillsApi integration-like flows', () => {
  it('creates a skill with normalized fields', async () => {
    const inserted = buildSkill({
      id: 'skill-created',
      name: 'Barre Chords',
      initial_confidence: 2,
    })

    const single = vi.fn().mockResolvedValue({
      data: inserted,
      error: null,
    })
    const select = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'skill_items') {
        return { insert }
      }

      throw new Error(`Unexpected table: ${table}`)
    })

    const result = await createSkillItem({
      outcomeId: 'outcome-1',
      name: '  Barre Chords ',
      initialConfidence: 2,
      targetLabel: ' ',
      targetValue: undefined,
    })

    expect(insert).toHaveBeenCalledWith({
      outcome_id: 'outcome-1',
      name: 'Barre Chords',
      initial_confidence: 2,
      target_label: null,
      target_value: null,
    })
    expect(result).toEqual(inserted)
  })

  it('maps duplicate live-skill-name DB errors to a clean message', async () => {
    const single = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: '23505',
        message: 'duplicate key value violates unique constraint "skill_items_outcome_name_live_unique_idx"',
        details: null,
      },
    })
    const select = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'skill_items') {
        return { insert }
      }

      throw new Error(`Unexpected table: ${table}`)
    })

    await expect(
      createSkillItem({
        outcomeId: 'outcome-1',
        name: 'Barre Chords',
        initialConfidence: 1,
      }),
    ).rejects.toThrow('A live skill with this name already exists for this outcome.')
  })

  it('updates a skill and transitions stage to review with suppression reset', async () => {
    const updated = buildSkill({
      id: 'skill-updated',
      name: 'Fingerpicking Pattern',
      initial_confidence: 4,
      stage: 'review',
      graduation_suppressed_at: null,
    })

    const singleForUpdate = vi.fn().mockResolvedValue({
      data: updated,
      error: null,
    })
    const selectForUpdate = vi.fn().mockReturnValue({ single: singleForUpdate })
    const eqForUpdate = vi.fn().mockReturnValue({ select: selectForUpdate })
    const update = vi.fn().mockReturnValue({ eq: eqForUpdate })

    const singleForStage = vi.fn().mockResolvedValue({
      data: updated,
      error: null,
    })
    const selectForStage = vi.fn().mockReturnValue({ single: singleForStage })
    const eqForStage = vi.fn().mockReturnValue({ select: selectForStage })
    const updateStage = vi.fn().mockReturnValue({ eq: eqForStage })

    let callCount = 0
    mockFrom.mockImplementation((table: string) => {
      if (table !== 'skill_items') {
        throw new Error(`Unexpected table: ${table}`)
      }

      callCount += 1

      if (callCount === 1) {
        return { update }
      }

      return { update: updateStage }
    })

    await updateSkillItem('skill-updated', {
      name: '  Fingerpicking Pattern ',
      targetLabel: '',
      targetValue: undefined,
      initialConfidence: 4,
    })

    expect(update).toHaveBeenCalledWith({
      name: 'Fingerpicking Pattern',
      target_label: null,
      target_value: null,
      initial_confidence: 4,
    })
    expect(eqForUpdate).toHaveBeenCalledWith('id', 'skill-updated')

    await setSkillStage('skill-updated', 'review')

    expect(updateStage).toHaveBeenCalledWith({
      stage: 'review',
      graduation_suppressed_at: null,
    })
    expect(eqForStage).toHaveBeenCalledWith('id', 'skill-updated')
  })

  it('upserts logs by action and deletes stale skill rows', async () => {
    const existingRows: SkillLogRow[] = [
      buildLog({
        id: 'log-existing',
        skill_item_id: 'skill-1',
        confidence: 2,
      }),
      buildLog({
        id: 'log-stale',
        skill_item_id: 'skill-stale',
        confidence: 4,
      }),
    ]

    const eqForExisting = vi.fn().mockResolvedValue({
      data: existingRows,
      error: null,
    })
    const select = vi.fn().mockReturnValue({ eq: eqForExisting })

    const eqForUpdate = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn().mockReturnValue({ eq: eqForUpdate })

    const insert = vi.fn().mockResolvedValue({ error: null })

    const inForDelete = vi.fn().mockResolvedValue({ error: null })
    const deleteRows = vi.fn().mockReturnValue({ in: inForDelete })

    let callCount = 0
    mockFrom.mockImplementation((table: string) => {
      if (table !== 'skill_logs') {
        throw new Error(`Unexpected table: ${table}`)
      }

      callCount += 1

      if (callCount === 1) {
        return { select }
      }

      if (callCount === 2) {
        return { update }
      }

      if (callCount === 3) {
        return { insert }
      }

      return { delete: deleteRows }
    })

    const result = await replaceSkillLogsForAction({
      actionLogId: 'action-1',
      entries: [
        {
          skillItemId: 'skill-1',
          confidence: 5,
          targetResult: 110,
        },
        {
          skillItemId: 'skill-2',
          confidence: 3,
          targetResult: null,
        },
      ],
    })

    expect(select).toHaveBeenCalledWith('*')
    expect(eqForExisting).toHaveBeenCalledWith('action_log_id', 'action-1')

    expect(update).toHaveBeenCalledWith({
      confidence: 5,
      target_result: 110,
    })
    expect(eqForUpdate).toHaveBeenCalledWith('id', 'log-existing')

    expect(insert).toHaveBeenCalledTimes(1)
    const insertedPayload = insert.mock.calls[0]?.[0] as Record<string, unknown>
    expect(insertedPayload['skill_item_id']).toBe('skill-2')
    expect(insertedPayload['action_log_id']).toBe('action-1')
    expect(insertedPayload['confidence']).toBe(3)
    expect(insertedPayload['target_result']).toBe(null)
    expect(typeof insertedPayload['logged_at']).toBe('string')

    expect(deleteRows).toHaveBeenCalledTimes(1)
    expect(inForDelete).toHaveBeenCalledWith('id', ['log-stale'])

    expect(result).toEqual({
      createdSkillIds: ['skill-2'],
    })
  })
})
