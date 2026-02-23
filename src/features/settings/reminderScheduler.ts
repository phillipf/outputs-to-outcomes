import type { UserSettingsRow } from './settingsApi'

const CHECK_INTERVAL_MS = 60 * 1000

function currentTimeHHMM(): string {
  const now = new Date()
  const hours = `${now.getHours()}`.padStart(2, '0')
  const minutes = `${now.getMinutes()}`.padStart(2, '0')
  return `${hours}:${minutes}`
}

function dateKey(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = `${now.getMonth() + 1}`.padStart(2, '0')
  const day = `${now.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function weekKey(startOfWeek: 0 | 1): string {
  const now = new Date()
  const day = now.getDay()
  const offset = (day - startOfWeek + 7) % 7
  const start = new Date(now)
  start.setDate(now.getDate() - offset)

  const year = start.getFullYear()
  const month = `${start.getMonth() + 1}`.padStart(2, '0')
  const dayOfMonth = `${start.getDate()}`.padStart(2, '0')

  return `${year}-${month}-${dayOfMonth}`
}

function weeklyReviewDay(startOfWeek: 0 | 1): number {
  return (startOfWeek + 6) % 7
}

export function startReminderScheduler(settings: UserSettingsRow): () => void {
  if (typeof window === 'undefined') {
    return () => {}
  }

  if (typeof Notification === 'undefined') {
    return () => {}
  }

  if (!settings.reminders_enabled || Notification.permission !== 'granted') {
    return () => {}
  }

  const run = () => {
    const now = new Date()
    const time = currentTimeHHMM()

    if (settings.daily_reminder_time && time === settings.daily_reminder_time) {
      const key = `daily-reminder:${dateKey()}`
      if (!window.localStorage.getItem(key)) {
        new Notification('Daily output reminder', {
          body: 'Log today\'s outputs in Outputs To Outcomes.',
        })
        window.localStorage.setItem(key, '1')
      }
    }

    if (
      settings.weekly_review_reminder_time &&
      now.getDay() === weeklyReviewDay(settings.start_of_week) &&
      time === settings.weekly_review_reminder_time
    ) {
      const key = `weekly-review:${weekKey(settings.start_of_week)}`

      if (!window.localStorage.getItem(key)) {
        new Notification('Weekly review reminder', {
          body: 'Open your weekly review and reflect on the week.',
        })
        window.localStorage.setItem(key, '1')
      }
    }
  }

  run()
  const timerId = window.setInterval(run, CHECK_INTERVAL_MS)

  return () => {
    window.clearInterval(timerId)
  }
}
