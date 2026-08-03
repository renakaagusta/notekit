import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { LoaderIcon, MailIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BrandMark } from '@/components/BrandMark'
import { sendMagicLink, signInWithGoogle } from '@/lib/auth-client'

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
})

type FormData = z.infer<typeof schema>

type View = 'login' | 'check-email'

export function LoginPage() {
  const [view, setView] = useState<View>('login')
  const [submittedEmail, setSubmittedEmail] = useState('')
  const [resendCountdown, setResendCountdown] = useState(0)

  const brandName = 'NoteKit'

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
    <div className="bg-background flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <BrandMark className="size-12" />
          <div className="text-center">
            <h1 className="text-2xl font-semibold tracking-tight">{brandName} Backoffice</h1>
            <p className="text-muted-foreground mt-1 text-sm">Sign in to the admin console</p>
          </div>
        </div>

        {view === 'login' ? (
          <div className="space-y-4">
            {/* Google OAuth */}
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleGoogleSignIn}
            >
              <svg className="mr-2 size-4" viewBox="0 0 24 24" fill="none">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Continue with Google
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background text-muted-foreground px-2">or</span>
              </div>
            </div>

            {/* Magic link */}
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@notekit.online"
                  autoComplete="email"
                  {...register('email')}
                />
                {errors.email && (
                  <p className="text-destructive text-xs">{errors.email.message}</p>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <LoaderIcon className="mr-2 size-4 animate-spin" />
                ) : (
                  <MailIcon className="mr-2 size-4" />
                )}
                Send login link
              </Button>
            </form>
          </div>
        ) : (
          <div className="space-y-4 text-center">
            <div className="bg-muted rounded-lg p-6">
              <MailIcon className="text-muted-foreground mx-auto mb-3 size-10" />
              <h2 className="mb-1 font-semibold">Check your email</h2>
              <p className="text-muted-foreground text-sm">
                We sent a login link to <strong>{submittedEmail}</strong>. It expires in 30 minutes.
              </p>
            </div>
            <Button
              variant="outline"
              className="w-full"
              disabled={resendCountdown > 0}
              onClick={handleResend}
            >
              {resendCountdown > 0 ? `Resend in ${resendCountdown}s` : 'Resend login link'}
            </Button>
            <button
              type="button"
              className="text-muted-foreground text-sm underline-offset-4 hover:underline"
              onClick={() => setView('login')}
            >
              Use a different email
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
