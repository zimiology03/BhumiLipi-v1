import { useEffect, useState } from 'react'
import './AccountPanel.css'

type AuthMode = 'login' | 'register'
type AuthResult = {
  access_token: string
  user: { user_id: string; identifier: string; method: 'email' | 'phone'; first_name: string; middle_name: string; last_name: string }
}

type Props = {
  initialMode: AuthMode
  bangla: boolean
  onClose: () => void
  onAuthenticated: (result: AuthResult) => void
  standalone?: boolean
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

async function postAuth<T>(path: string, payload: object): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}/auth/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    throw new Error('Cannot reach the backend. Start the BhumiLipi backend and try again.')
  }
  const data = await response.json().catch(() => ({})) as { detail?: string }
  if (!response.ok) throw new Error(data.detail || 'Account request failed. Please try again.')
  return data as T
}

export default function AccountPanel({ initialMode, bangla, onClose, onAuthenticated, standalone = false }: Props) {
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [stage, setStage] = useState<'credentials' | 'code'>('credentials')
  const [registrationMethod, setRegistrationMethod] = useState<'email' | 'phone'>('email')
  const [firstName, setFirstName] = useState('')
  const [middleName, setMiddleName] = useState('')
  const [lastName, setLastName] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [resendSeconds, setResendSeconds] = useState(0)

  useEffect(() => {
    if (resendSeconds <= 0) return
    const timer = window.setTimeout(() => setResendSeconds((value) => Math.max(0, value - 1)), 1000)
    return () => window.clearTimeout(timer)
  }, [resendSeconds])

  useEffect(() => {
    if (standalone) return
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, standalone])

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode)
    setStage('credentials')
    setMessage('')
    setCode('')
    setPassword('')
    setConfirmPassword('')
  }

  const requestCode = async () => {
    setMessage('')
    if (mode === 'register' && ((registrationMethod === 'email') !== identifier.includes('@'))) {
      setMessage(bangla ? 'নির্বাচিত পদ্ধতি অনুযায়ী email বা phone number লিখুন।' : `Enter a valid ${registrationMethod === 'email' ? 'email address' : 'phone number'} for the selected option.`)
      return
    }
    if (mode === 'register' && password !== confirmPassword) {
      setMessage(bangla ? 'দুটি password মিলছে না।' : 'The passwords do not match.')
      return
    }
    setBusy(true)
    try {
      const action = mode === 'register' ? 'register' : 'login'
      const profile = mode === 'register' ? { first_name: firstName.trim(), middle_name: middleName.trim(), last_name: lastName.trim() } : {}
      const result = await postAuth<{ message: string; resend_after: number }>(`${action}/request-otp`, { identifier, password, ...profile })
      setStage('code')
      setResendSeconds(result.resend_after || 60)
      setMessage(bangla ? 'আপনার email বা phone-এ verification code পাঠানো হয়েছে।' : result.message)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not send the verification code.')
    } finally {
      setBusy(false)
    }
  }

  const verifyCode = async () => {
    setMessage('')
    setBusy(true)
    try {
      const action = mode === 'register' ? 'register' : 'login'
      const result = await postAuth<AuthResult>(`${action}/verify-otp`, { identifier, code })
      onAuthenticated(result)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not verify that code.')
    } finally {
      setBusy(false)
    }
  }

  const panel = <section className={`account-dialog${standalone ? ' account-dialog-standalone' : ''}`} role={standalone ? 'region' : 'dialog'} aria-modal={standalone ? undefined : true} aria-labelledby="account-dialog-title">
      {!standalone && <button type="button" className="account-dialog-close" aria-label={bangla ? 'বন্ধ করুন' : 'Close'} onClick={onClose}>×</button>}
      <div className="eyebrow">BHUMILIPI · ACCOUNT</div>
      <h2 id="account-dialog-title">{mode === 'register' ? (bangla ? 'নতুন account তৈরি করুন' : 'Create your account') : (bangla ? 'আপনার account-এ sign in করুন' : 'Sign in to your account')}</h2>

      {stage === 'credentials' ? <>
        {mode === 'register' && <div className="account-name-fields">
          <label>{bangla ? 'নামের প্রথম অংশ' : 'First name'}
            <input autoComplete="given-name" type="text" maxLength={100} value={firstName} onChange={(event) => setFirstName(event.target.value)} required />
          </label>
          <label>{bangla ? 'মাঝের নাম (ঐচ্ছিক)' : 'Middle name (optional)'}
            <input autoComplete="additional-name" type="text" maxLength={100} value={middleName} onChange={(event) => setMiddleName(event.target.value)} />
          </label>
          <label>{bangla ? 'নামের শেষ অংশ' : 'Last name'}
            <input autoComplete="family-name" type="text" maxLength={100} value={lastName} onChange={(event) => setLastName(event.target.value)} required />
          </label>
        </div>}
        {mode === 'register' && <div className="account-mode-switch account-identifier-switch" role="group" aria-label={bangla ? 'OTP কোথায় পাঠাবেন' : 'Where to send the OTP'}>
          <button type="button" className={registrationMethod === 'email' ? 'active' : ''} aria-pressed={registrationMethod === 'email'} onClick={() => { setRegistrationMethod('email'); setIdentifier('') }}>{bangla ? 'Email' : 'Email'}</button>
          <button type="button" className={registrationMethod === 'phone' ? 'active' : ''} aria-pressed={registrationMethod === 'phone'} onClick={() => { setRegistrationMethod('phone'); setIdentifier('') }}>{bangla ? 'Phone number' : 'Phone number'}</button>
        </div>}
        <label>{mode === 'register' ? (registrationMethod === 'email' ? (bangla ? 'ইমেইল ঠিকানা' : 'Email address') : (bangla ? 'ফোন নম্বর' : 'Phone number')) : (bangla ? 'ইমেইল অথবা ফোন নম্বর' : 'Email or phone number')}
          <input autoComplete="username" type={mode === 'register' && registrationMethod === 'phone' ? 'tel' : 'text'} value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder={mode === 'register' && registrationMethod === 'phone' ? '+8801XXXXXXXXX' : (bangla ? 'name@example.com অথবা +8801…' : 'name@example.com or +8801…')} required />
        </label>
        {mode === 'register' && <p className="account-form-hint">{bangla ? 'এখানে email অথবা phone number দিন। যে মাধ্যমে account খুলবেন, OTP সেখানেই যাবে। NID চাওয়া হচ্ছে না—এই account-এর জন্য এটি দরকার নেই।' : 'Enter an email or phone number; its OTP will verify the account. NID is not collected because this account does not need it.'}</p>}
        <label>{bangla ? 'Password' : 'Password'}
          <input autoComplete={mode === 'register' ? 'new-password' : 'current-password'} type="password" minLength={8} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} required />
        </label>
        {mode === 'register' && <label>{bangla ? 'Password আবার লিখুন' : 'Confirm password'}
          <input autoComplete="new-password" type="password" minLength={8} maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
        </label>}
        <p className="account-form-hint">{bangla ? 'Password কমপক্ষে ৮ অক্ষরের হতে হবে। বাংলাদেশি 01… number-ও ব্যবহার করা যাবে।' : 'Use at least 8 characters. Bangladeshi 01… phone numbers are accepted.'}</p>
        <button type="button" className="primary-button account-submit" onClick={() => void requestCode()} disabled={busy || !identifier.trim() || password.length < 8 || (mode === 'register' && (!firstName.trim() || !lastName.trim() || confirmPassword.length < 8))}>
          {busy ? (bangla ? 'অপেক্ষা করুন…' : 'Please wait…') : (mode === 'register' ? (bangla ? 'Create account ও OTP পাঠান' : 'Create account and send OTP') : (bangla ? 'OTP পাঠান' : 'Send verification code'))}
        </button>
        <p className="account-switch-prompt">
          {mode === 'register' ? (bangla ? 'ইতিমধ্যে account আছে?' : 'Already have one?') : (bangla ? 'নতুন account দরকার?' : 'New to BhumiLipi?')}
          {' '}<button type="button" onClick={() => switchMode(mode === 'register' ? 'login' : 'register')}>
            {mode === 'register' ? (bangla ? 'Log in' : 'Log in') : (bangla ? 'Create an account' : 'Create an account')}
          </button>
        </p>
      </> : <>
        <p>{bangla ? `${identifier}-এ পাঠানো ৬ সংখ্যার code লিখুন।` : `Enter the 6-digit code sent to ${identifier}.`}</p>
        <label>{bangla ? 'Verification code' : 'Verification code'}
          <input autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} />
        </label>
        <button type="button" className="primary-button account-submit" onClick={() => void verifyCode()} disabled={busy || code.length !== 6}>
          {busy ? (bangla ? 'যাচাই হচ্ছে…' : 'Verifying…') : (bangla ? 'যাচাই করে sign in করুন' : 'Verify and sign in')}
        </button>
        <button type="button" className="account-link-button" onClick={() => void requestCode()} disabled={busy || resendSeconds > 0}>
          {resendSeconds > 0 ? (bangla ? `${resendSeconds} সেকেন্ড পর আবার পাঠানো যাবে` : `Send another code in ${resendSeconds}s`) : (bangla ? 'নতুন code পাঠান' : 'Send a new code')}
        </button>
        <button type="button" className="account-link-button" onClick={() => { setStage('credentials'); setCode(''); setMessage('') }}>{bangla ? 'Email/phone বা password বদলান' : 'Change email/phone or password'}</button>
      </>}

      {message && <p className="account-feedback" role="status">{message}</p>}
      <p className="account-security-note">{bangla ? 'Verification code-এর মেয়াদ ১০ মিনিট। কোনো code কারও সঙ্গে share করবেন না।' : 'Codes expire after 10 minutes. Never share a verification code with anyone.'}</p>
  </section>

  return standalone ? panel : <div className="account-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    {panel}
  </div>
}
