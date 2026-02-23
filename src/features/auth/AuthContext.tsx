import {
  createContext,
  type PropsWithChildren,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'

import { env } from '../../config/env'
import { supabase } from '../../lib/supabase'

type SendMagicLinkResult = {
  error: string | null
}

type AuthContextValue = {
  user: User | null
  session: Session | null
  loading: boolean
  allowedEmail: string
  sendMagicLink: (email: string) => Promise<SendMagicLinkResult>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

function isAllowlistedEmail(email: string | undefined, allowedEmail: string): boolean {
  if (!email) {
    return false
  }

  return normalizeEmail(email) === allowedEmail
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function bootstrapAuth() {
      const { data, error } = await supabase.auth.getSession()

      if (error) {
        console.error('Failed to read auth session', error)
      }

      if (!mounted) {
        return
      }

      const currentSession = data.session
      const currentUser = currentSession?.user ?? null

      if (currentUser && !isAllowlistedEmail(currentUser.email, env.allowedEmail)) {
        await supabase.auth.signOut()
        setSession(null)
        setUser(null)
      } else {
        setSession(currentSession)
        setUser(currentUser)
      }

      setLoading(false)
    }

    bootstrapAuth()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      const nextUser = nextSession?.user ?? null

      if (nextUser && !isAllowlistedEmail(nextUser.email, env.allowedEmail)) {
        void supabase.auth.signOut()
        setSession(null)
        setUser(null)
        return
      }

      setSession(nextSession)
      setUser(nextUser)
      setLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      loading,
      allowedEmail: env.allowedEmail,
      sendMagicLink: async (email: string) => {
        const normalizedEmail = normalizeEmail(email)

        if (normalizedEmail !== env.allowedEmail) {
          return {
            error: `This app is restricted to ${env.allowedEmail}.`,
          }
        }

        const { error } = await supabase.auth.signInWithOtp({
          email: normalizedEmail,
          options: {
            emailRedirectTo: window.location.origin,
            shouldCreateUser: false,
          },
        })

        return {
          error: error?.message ?? null,
        }
      },
      signOut: async () => {
        const { error } = await supabase.auth.signOut()

        if (error) {
          console.error('Failed to sign out', error)
        }
      },
    }),
    [loading, session, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export { AuthContext }
