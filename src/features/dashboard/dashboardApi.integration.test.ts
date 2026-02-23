import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockFrom, mockDeleteSkillLogsByActionLogId } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockDeleteSkillLogsByActionLogId: vi.fn(),
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: mockFrom,
    rpc: vi.fn(),
  },
}))

vi.mock('../skills/skillsApi', () => ({
  deleteSkillLogsByActionLogId: mockDeleteSkillLogsByActionLogId,
}))

import { saveActionLog } from './dashboardApi'

beforeEach(() => {
  mockFrom.mockReset()
  mockDeleteSkillLogsByActionLogId.mockReset()
  mockDeleteSkillLogsByActionLogId.mockResolvedValue(undefined)
})

describe('dashboardApi saveActionLog integration-like flows', () => {
  it('deletes linked skill logs when an existing action is set to completed=0', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: 'action-existing' },
      error: null,
    })
    const eqDate = vi.fn().mockReturnValue({ maybeSingle })
    const eqOutput = vi.fn().mockReturnValue({ eq: eqDate })
    const select = vi.fn().mockReturnValue({ eq: eqOutput })

    const eqUpdate = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn().mockReturnValue({ eq: eqUpdate })

    let callCount = 0
    mockFrom.mockImplementation((table: string) => {
      if (table !== 'action_logs') {
        throw new Error(`Unexpected table: ${table}`)
      }

      callCount += 1

      if (callCount === 1) {
        return { select }
      }

      return { update }
    })

    const result = await saveActionLog({
      outputId: 'output-1',
      actionDate: '2026-02-23',
      completed: 0,
      total: 1,
      notes: '  reset ',
    })

    expect(select).toHaveBeenCalledWith('id')
    expect(eqOutput).toHaveBeenCalledWith('output_id', 'output-1')
    expect(eqDate).toHaveBeenCalledWith('action_date', '2026-02-23')

    expect(update).toHaveBeenCalledWith({
      completed: 0,
      total: 1,
      notes: 'reset',
    })
    expect(eqUpdate).toHaveBeenCalledWith('id', 'action-existing')
    expect(mockDeleteSkillLogsByActionLogId).toHaveBeenCalledWith('action-existing')

    expect(result).toEqual({
      actionLogId: 'action-existing',
      completed: 0,
    })
  })

  it('inserts a new action log when one does not exist and does not delete skill logs', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: null,
      error: null,
    })
    const eqDate = vi.fn().mockReturnValue({ maybeSingle })
    const eqOutput = vi.fn().mockReturnValue({ eq: eqDate })
    const select = vi.fn().mockReturnValue({ eq: eqOutput })

    const singleInsert = vi.fn().mockResolvedValue({
      data: { id: 'action-new' },
      error: null,
    })
    const selectInsert = vi.fn().mockReturnValue({ single: singleInsert })
    const insert = vi.fn().mockReturnValue({ select: selectInsert })

    let callCount = 0
    mockFrom.mockImplementation((table: string) => {
      if (table !== 'action_logs') {
        throw new Error(`Unexpected table: ${table}`)
      }

      callCount += 1

      if (callCount === 1) {
        return { select }
      }

      return { insert }
    })

    const result = await saveActionLog({
      outputId: 'output-2',
      actionDate: '2026-02-23',
      completed: 2,
      total: 3,
      notes: '  good session  ',
    })

    expect(insert).toHaveBeenCalledWith({
      output_id: 'output-2',
      action_date: '2026-02-23',
      completed: 2,
      total: 3,
      notes: 'good session',
    })
    expect(mockDeleteSkillLogsByActionLogId).not.toHaveBeenCalled()

    expect(result).toEqual({
      actionLogId: 'action-new',
      completed: 2,
    })
  })
})
