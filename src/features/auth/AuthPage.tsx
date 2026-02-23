import { type FormEvent, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'

import { useAuth } from './useAuth'

export function AuthPage() {
  const { user, loading, allowedEmail, sendMagicLink } = useAuth()

  const [email, setEmail] = useState(allowedEmail)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const helperText = useMemo(
    () => `This deployment only allows sign-in for ${allowedEmail}.`,
    [allowedEmail],
  )

  if (loading) {
    return (
      <main className="auth-shell">
        <section className="auth-card panel">Checking your session...</section>
      </main>
    )
  }

  if (user) {
    return <Navigate replace to="/" />
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)
    setSuccessMessage(null)
    setSubmitting(true)

    const result = await sendMagicLink(email)

    if (result.error) {
      setErrorMessage(result.error)
      setSubmitting(false)
      return
    }

    setSuccessMessage('Magic link sent. Check your inbox to continue.')
    setSubmitting(false)
  }

  return (
    <main className="auth-shell">
      <section className="auth-card panel">
        <p className="eyebrow">Outputs To Outcomes</p>
        <h1>Sign in</h1>
        <p className="muted">Use your allowlisted email to receive a magic link.</p>

        <form className="stack" onSubmit={handleSubmit}>
          <label className="form-row" htmlFor="email">
            Email
            <input
              autoComplete="email"
              id="email"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>

          <button className="btn" disabled={submitting} type="submit">
            {submitting ? 'Sending...' : 'Send magic link'}
          </button>
        </form>

        <p className="hint">{helperText}</p>

        {errorMessage ? <p className="status-bad">{errorMessage}</p> : null}
        {successMessage ? <p className="status-good">{successMessage}</p> : null}
      </section>
    </main>
  )
}
