import { useEffect, useMemo, useState } from 'react'

import { useAuth } from '../auth/useAuth'
import {
  fetchOrCreateUserSettings,
  purgeAllAppData,
  updateUserSettings,
  type UserSettingsRow,
} from './settingsApi'
import { startReminderScheduler } from './reminderScheduler'

type SettingsDraft = {
  startOfWeek: 0 | 1
  remindersEnabled: boolean
  dailyReminderTime: string
  weeklyReviewReminderTime: string
}

function toDraft(settings: UserSettingsRow): SettingsDraft {
  return {
    startOfWeek: settings.start_of_week,
    remindersEnabled: settings.reminders_enabled,
    dailyReminderTime: settings.daily_reminder_time ?? '',
    weeklyReviewReminderTime: settings.weekly_review_reminder_time ?? '',
  }
}

export function SettingsPage() {
  const { user } = useAuth()
  const initialPermission =
    typeof Notification === 'undefined' ? 'default' : Notification.permission

  const [settings, setSettings] = useState<UserSettingsRow | null>(null)
  const [draft, setDraft] = useState<SettingsDraft | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [notificationPermission, setNotificationPermission] = useState(initialPermission)

  useEffect(() => {
    let cleanup: (() => void) | null = null

    if (settings) {
      cleanup = startReminderScheduler(settings)
    }

    return () => {
      cleanup?.()
    }
  }, [settings])

  useEffect(() => {
    async function loadSettings() {
      setLoading(true)
      setErrorMessage(null)

      try {
        const row = await fetchOrCreateUserSettings()
        setSettings(row)
        setDraft(toDraft(row))
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load settings'
        setErrorMessage(message)
      } finally {
        setLoading(false)
      }
    }

    void loadSettings()
  }, [])

  const reminderCapabilityText = useMemo(() => {
    if (notificationPermission === 'granted') {
      return 'Browser notification permission granted.'
    }

    if (notificationPermission === 'denied') {
      return 'Browser notification permission denied. Enable it in browser settings to receive reminders.'
    }

    return 'Browser notification permission not granted yet.'
  }, [notificationPermission])

  async function handleSaveSettings() {
    if (!settings || !draft) {
      return
    }

    setBusyKey('save-settings')
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      const updated = await updateUserSettings({
        id: settings.id,
        start_of_week: draft.startOfWeek,
        reminders_enabled: draft.remindersEnabled,
        daily_reminder_time: draft.dailyReminderTime || null,
        weekly_review_reminder_time: draft.weeklyReviewReminderTime || null,
      })

      setSettings(updated)
      setDraft(toDraft(updated))
      setSuccessMessage('Settings saved.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save settings'
      setErrorMessage(message)
    } finally {
      setBusyKey(null)
    }
  }

  async function handleRequestPermission() {
    if (typeof Notification === 'undefined') {
      setErrorMessage('Notifications are not supported in this browser.')
      return
    }

    const permission = await Notification.requestPermission()
    setNotificationPermission(permission)
  }

  function handleTestNotification() {
    if (typeof Notification === 'undefined') {
      setErrorMessage('Notifications are not supported in this browser.')
      return
    }

    if (Notification.permission !== 'granted') {
      setErrorMessage('Grant notification permission first.')
      return
    }

    new Notification('Outputs To Outcomes', {
      body: 'Test reminder delivered. Browser reminders are best-effort in v1.',
    })
  }

  async function handlePurgeData() {
    const confirmed = window.confirm(
      'Delete all app data? This removes outcomes, outputs, logs, metrics, reflections, and settings.',
    )

    if (!confirmed) {
      return
    }

    setBusyKey('purge-data')
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      await purgeAllAppData()
      setSuccessMessage('All app data deleted. Reloading empty workspace...')
      window.setTimeout(() => {
        window.location.assign('/')
      }, 600)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to purge app data'
      setErrorMessage(message)
    } finally {
      setBusyKey(null)
    }
  }

  if (loading || !settings || !draft) {
    return (
      <section className="stack">
        <header className="stack-sm">
          <p className="eyebrow">Settings</p>
          <h1>Preferences & Data</h1>
        </header>
        <article className="panel">Loading settings...</article>
      </section>
    )
  }

  return (
    <section className="stack">
      <header className="stack-sm">
        <p className="eyebrow">Settings</p>
        <h1>Preferences & Data</h1>
        <p className="muted">Signed in as {user?.email ?? 'unknown user'}.</p>
      </header>

      {errorMessage ? <p className="status-bad">{errorMessage}</p> : null}
      {successMessage ? <p className="status-good">{successMessage}</p> : null}

      <article className="panel stack-sm">
        <h2>Weekly behavior</h2>

        <label className="form-row" htmlFor="start-of-week">
          Start of week
          <select
            id="start-of-week"
            onChange={(event) =>
              setDraft((previous) =>
                previous
                  ? {
                      ...previous,
                      startOfWeek: Number(event.target.value) as 0 | 1,
                    }
                  : previous,
              )
            }
            value={draft.startOfWeek}
          >
            <option value={1}>Monday</option>
            <option value={0}>Sunday</option>
          </select>
        </label>
      </article>

      <article className="panel stack-sm">
        <h2>Reminders (best-effort in v1)</h2>

        <label className="toggle-row" htmlFor="reminders-enabled">
          <input
            checked={draft.remindersEnabled}
            id="reminders-enabled"
            onChange={(event) =>
              setDraft((previous) =>
                previous
                  ? {
                      ...previous,
                      remindersEnabled: event.target.checked,
                    }
                  : previous,
              )
            }
            type="checkbox"
          />
          Enable browser reminders
        </label>

        <label className="form-row" htmlFor="daily-reminder-time">
          Daily reminder time
          <input
            id="daily-reminder-time"
            onChange={(event) =>
              setDraft((previous) =>
                previous
                  ? {
                      ...previous,
                      dailyReminderTime: event.target.value,
                    }
                  : previous,
              )
            }
            type="time"
            value={draft.dailyReminderTime}
          />
        </label>

        <label className="form-row" htmlFor="weekly-reminder-time">
          Weekly review reminder time
          <input
            id="weekly-reminder-time"
            onChange={(event) =>
              setDraft((previous) =>
                previous
                  ? {
                      ...previous,
                      weeklyReviewReminderTime: event.target.value,
                    }
                  : previous,
              )
            }
            type="time"
            value={draft.weeklyReviewReminderTime}
          />
        </label>

        <p className="hint">{reminderCapabilityText}</p>

        <div className="actions-row">
          <button className="btn btn-secondary" onClick={() => void handleRequestPermission()} type="button">
            Request permission
          </button>
          <button className="btn btn-secondary" onClick={handleTestNotification} type="button">
            Send test notification
          </button>
        </div>
      </article>

      <article className="panel stack-sm">
        <h2>Data controls</h2>
        <p className="muted">
          v1 supports deleting all app data. Auth account deletion is deferred to v1.1.
        </p>

        <button
          className="btn btn-secondary"
          disabled={busyKey === 'purge-data'}
          onClick={() => void handlePurgeData()}
          type="button"
        >
          {busyKey === 'purge-data' ? 'Deleting...' : 'Delete all app data'}
        </button>
      </article>

      <button
        className="btn"
        disabled={busyKey === 'save-settings'}
        onClick={() => void handleSaveSettings()}
        type="button"
      >
        {busyKey === 'save-settings' ? 'Saving...' : 'Save settings'}
      </button>
    </section>
  )
}
