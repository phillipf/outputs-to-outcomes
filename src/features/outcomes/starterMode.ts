import type { OutputDraft, Weekday } from './types'

export type StarterSuggestion = {
  draft: OutputDraft
  reason: string
}

function toUniqueWeekdays(days: Weekday[]): Weekday[] {
  return [...new Set(days)].sort((a, b) => a - b) as Weekday[]
}

export function getStarterSuggestion(draft: OutputDraft): StarterSuggestion | null {
  if (draft.frequency_type === 'daily') {
    return {
      draft: {
        ...draft,
        frequency_type: 'flexible_weekly',
        frequency_value: 3,
        schedule_weekdays: [],
      },
      reason: 'Daily commitments are often too aggressive at the start. Try 3x/week first.',
    }
  }

  if (draft.frequency_type === 'fixed_weekly' && draft.schedule_weekdays.length > 3) {
    return {
      draft: {
        ...draft,
        frequency_value: 3,
        schedule_weekdays: toUniqueWeekdays(draft.schedule_weekdays).slice(0, 3),
      },
      reason: 'A smaller fixed schedule is easier to sustain while building consistency.',
    }
  }

  if (draft.frequency_type === 'flexible_weekly' && draft.frequency_value > 3) {
    return {
      draft: {
        ...draft,
        frequency_value: Math.max(1, Math.ceil(draft.frequency_value / 2)),
      },
      reason: 'Reducing weekly target helps avoid early burnout.',
    }
  }

  return null
}
