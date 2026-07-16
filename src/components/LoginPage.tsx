import { ArrowRight, ShieldCheck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { requestEmailOtp, signInWithEmailOtp } from '../lib/auth'

type Props = { onAuthenticated: () => Promise<void> }

export const LoginPage = ({ onAuthenticated }: Props) => {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [otp, setOtp] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submitEmail = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setBusy(true)
    try { await requestEmailOtp(email.trim()); setSent(true) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to send the sign-in code.') } finally { setBusy(false) }
  }
  const submitOtp = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setBusy(true)
    try { await signInWithEmailOtp(email.trim(), otp.trim(), name); await onAuthenticated() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to verify the sign-in code.') } finally { setBusy(false) }
  }
  return <main className="auth-page"><section className="auth-card" aria-labelledby="auth-title"><div className="auth-mark"><ShieldCheck size={20} /></div><span className="task-kicker">ONEVibe · protected workspace</span><h1 id="auth-title">Sign in to your workspace</h1><p>Use your work email. ONEVibe sends a one-time code through the configured enterprise delivery service.</p>{!sent ? <form onSubmit={(event) => void submitEmail(event)}><label>Email address<input autoFocus type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="you@company.com" /></label><button type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send sign-in code'}<ArrowRight size={15} /></button></form> : <form onSubmit={(event) => void submitOtp(event)}><label>Verification code<input autoFocus inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} autoComplete="one-time-code" placeholder="000000" /></label><label>Name <span>(first sign-in only)</span><input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" placeholder="Your name" /></label><button type="submit" disabled={busy || otp.length !== 6}>{busy ? 'Verifying…' : 'Enter workspace'}<ArrowRight size={15} /></button><button type="button" className="auth-secondary" onClick={() => { setSent(false); setOtp(''); setError('') }}>Use a different email</button></form>}{error && <p className="auth-error" role="alert">{error}</p>}<small className="auth-boundary">Authentication is separate from VTI Wallet approvals. A browser session cannot approve consequential actions.</small></section></main>
}
