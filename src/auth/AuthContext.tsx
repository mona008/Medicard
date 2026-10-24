import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase'
import { signInErrorMessage, signUpErrorMessage } from '@/lib/authErrors'

export type AuthStatus = 'unconfigured' | 'loading' | 'signedOut' | 'signedIn'

export interface AuthResult {
  error: string | null
}

export interface SignUpResult extends AuthResult {
  /** True when Supabase requires the user to click an email confirmation link. */
  needsConfirmation: boolean
}

interface AuthContextValue {
  status: AuthStatus
  user: User | null
  session: Session | null
  signIn: (email: string, password: string) => Promise<AuthResult>
  signUp: (email: string, password: string, fullName: string) => Promise<SignUpResult>
  signOut: () => Promise<void>
}

const SETUP_ERROR =
  'Application setup is incomplete. Add your Supabase configuration (.env) to continue.'

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(() =>
    isSupabaseConfigured() ? 'loading' : 'unconfigured',
  )
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    if (!isSupabaseConfigured()) return

    const supabase = getSupabase()
    let active = true

    const apply = (next: Session | null) => {
      if (!active) return
      setSession(next)
      setUser(next?.user ?? null)
      setStatus(next ? 'signedIn' : 'signedOut')
    }

    void supabase.auth.getSession().then(({ data }) => {
      apply(data.session)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      apply(next)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    if (!isSupabaseConfigured()) return { error: SETUP_ERROR }

    const { error } = await getSupabase().auth.signInWithPassword({ email, password })
    if (error) return { error: signInErrorMessage(error) }
    return { error: null }
  }, [])

  const signUp = useCallback(
    async (email: string, password: string, fullName: string): Promise<SignUpResult> => {
      if (!isSupabaseConfigured()) return { error: SETUP_ERROR, needsConfirmation: false }

      const { data, error } = await getSupabase().auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: `${window.location.origin}/login`,
        },
      })

      if (error) return { error: signUpErrorMessage(error), needsConfirmation: false }

      // With email confirmation enabled, signing up an existing address returns
      // a user object with an empty `identities` array instead of an error.
      if (data.user && data.user.identities?.length === 0) {
        return {
          error: 'An account with this email already exists. Try signing in instead.',
          needsConfirmation: false,
        }
      }

      return { error: null, needsConfirmation: !data.session }
    },
    [],
  )

  const signOut = useCallback(async () => {
    if (!isSupabaseConfigured()) return
    try {
      await getSupabase().auth.signOut()
    } catch {
      // Signing out locally still clears the session even if the network call fails.
      setSession(null)
      setUser(null)
      setStatus('signedOut')
    }
  }, [])

  const value = useMemo(
    () => ({ status, user, session, signIn, signUp, signOut }),
    [status, user, session, signIn, signUp, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used inside <AuthProvider>')
  }
  return context
}
