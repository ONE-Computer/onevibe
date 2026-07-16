export type AuthUser = { id: string; name?: string | null; email: string }
export type AuthSessionState = { enabled: boolean; session: { user: AuthUser } | null }

const authJson = async <T>(response: Response): Promise<T> => {
  const body = await response.json() as T & { message?: string; error?: string }
  if (!response.ok) throw new Error(body.message ?? body.error ?? `Authentication request failed (${response.status})`)
  return body
}

export const getAuthSession = async () => authJson<AuthSessionState>(await fetch('/api/auth/session', { credentials: 'include' }))

export const requestEmailOtp = async (email: string) => authJson<{ success: boolean }>(await fetch('/api/auth/email-otp/send-verification-otp', {
  method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, type: 'sign-in' }),
}))

export const signInWithEmailOtp = async (email: string, otp: string, name?: string) => authJson<{ user: AuthUser }>(await fetch('/api/auth/sign-in/email-otp', {
  method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, otp, ...(name?.trim() ? { name: name.trim() } : {}) }),
}))

export const signOut = async () => authJson<{ success: boolean }>(await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' }))
