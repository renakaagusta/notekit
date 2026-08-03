import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { LoaderIcon, MailIcon } from 'lucide-react'

import { sendMagicLink, signInWithGoogle } from '@/lib/auth-client'

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
})

type FormData = z.infer<typeof schema>

type View = 'login' | 'check-email'

// A faint live-data motif for the left brand panel — mirrors the app's auth
// screen, but streams what the backoffice actually watches over.
const STREAM = `notekit backoffice --prod
✓ users            active accounts
✓ plus             subscribers · mrr
✓ vaults           forgejo · github · gitlab
✓ agents           tokens · e2ee grants
  region  sea · id
  auth    google · magic-link`

/** NoteKit diagonal-slash mark (reads var(--accent)). */
function NoteKitMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <line
        x1="10.5"
        y1="26"
        x2="21.5"
        y2="6"
        stroke="var(--accent,#f4f4f5)"
        strokeWidth="6.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.75h3.57c2.08-1.92 3.28-4.74 3.28-8.07z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.75c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.12A6.6 6.6 0 0 1 5.5 12c0-.74.13-1.45.34-2.12V7.04H2.18A11 11 0 0 0 1 12c0 1.77.42 3.45 1.18 4.96l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.2 1.65l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.04l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  )
}

/**
 * Split-screen dark auth matching app.notekit.online: left = brand + a faint
 * live-data motif on a hairline grid, right = the auth stack (Google OAuth +
 * magic link). Colors are explicit so it reads identically regardless of theme.
 */
export function LoginPage() {
  const [view, setView] = useState<View>('login')
  const [submittedEmail, setSubmittedEmail] = useState('')
  const [resendCountdown, setResendCountdown] = useState(0)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  function handleGoogleSignIn() {
    signInWithGoogle()
  }

  async function onSubmit(data: FormData) {
    const result = await sendMagicLink(data.email)
    if (result.error) {
      toast.error(result.error)
      return
    }
    setSubmittedEmail(data.email)
    setView('check-email')
    startResendCountdown()
  }

  function startResendCountdown() {
    setResendCountdown(60)
    const interval = setInterval(() => {
      setResendCountdown((c) => {
        if (c <= 1) { clearInterval(interval); return 0 }
        return c - 1
      })
    }, 1000)
  }

  async function handleResend() {
    const result = await sendMagicLink(submittedEmail)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success('Login link resent')
    startResendCountdown()
  }

  return (
    <div className="nk-auth" data-theme="dark">
      {/* LEFT · brand + live-data motif */}
      <div className="nk-auth-left">
        <pre className="nk-auth-stream" aria-hidden>
          {STREAM}
        </pre>
        <div className="nk-auth-left-inner">
          <div className="nk-auth-lockup">
            <NoteKitMark size={20} />
            <span className="nk-auth-word">notekit</span>
          </div>
          <div className="nk-auth-pitch">
            <h2 className="nk-auth-h2">The console behind NoteKit.</h2>
            <p className="nk-auth-lead">
              Users, subscriptions, vaults &amp; agents — one place to run the
              platform. Admin access only.
            </p>
          </div>
          <div className="nk-auth-tags">users · subscriptions · vaults · agents</div>
        </div>
      </div>

      {/* RIGHT · auth */}
      <div className="nk-auth-right">
        <div className="nk-auth-panel">
          {/* mobile-only lockup */}
          <div className="nk-auth-lockup nk-auth-lockup-mobile">
            <NoteKitMark size={20} />
            <span className="nk-auth-word">notekit</span>
          </div>

          <div className="nk-auth-overline">// backoffice</div>
          <h1 className="nk-auth-h1">Sign in to the console.</h1>
          <p className="nk-auth-lead">
            Superadmin access to the NoteKit platform.
          </p>

          {view === 'login' ? (
            <>
              <div className="nk-signin-buttons">
                <button className="nk-signin-btn" onClick={handleGoogleSignIn}>
                  <GoogleIcon />
                  Continue with Google
                </button>
              </div>

              <div className="bo-divider">or</div>

              <form onSubmit={handleSubmit(onSubmit)} className="nk-signin-token-form">
                <label htmlFor="email" className="bo-field-label">Email address</label>
                <input
                  id="email"
                  type="email"
                  className="nk-signin-token-input"
                  placeholder="you@notekit.online"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  autoComplete="email"
                  {...register('email')}
                />
                {errors.email && (
                  <p className="nk-signin-error" role="alert">{errors.email.message}</p>
                )}
                <button
                  type="submit"
                  className="nk-signin-btn bo-signin-btn-primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <LoaderIcon className="animate-spin" size={18} />
                  ) : (
                    <MailIcon size={18} />
                  )}
                  Send login link
                </button>
              </form>
            </>
          ) : (
            <div className="nk-signin-token-form">
              <div className="bo-check-email">
                <MailIcon size={34} style={{ margin: '0 auto 10px', color: 'var(--auth-muted)' }} />
                <h2 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700 }}>Check your email</h2>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--auth-lead)', lineHeight: 1.55 }}>
                  We sent a login link to <strong>{submittedEmail}</strong>. It expires in 30 minutes.
                </p>
              </div>
              <button
                className="nk-signin-btn"
                disabled={resendCountdown > 0}
                onClick={handleResend}
              >
                {resendCountdown > 0 ? `Resend in ${resendCountdown}s` : 'Resend login link'}
              </button>
              <button
                type="button"
                className="nk-signin-btn-link"
                onClick={() => setView('login')}
              >
                Use a different email
              </button>
            </div>
          )}

          <div className="nk-auth-rule" />
          <p className="nk-auth-foot">
            Restricted to platform administrators. Sign-ins are gated by an
            allowlist — everyone else is turned away.
          </p>
        </div>
      </div>
    </div>
  )
}
