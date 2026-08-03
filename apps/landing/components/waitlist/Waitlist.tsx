'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  InputButtonProvider,
  InputButtonAction,
  InputButtonInput,
  InputButtonSubmit,
} from '@/components/ui/shadcn-io/input-button'

export default function Waitlist() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function handleSubmit() {
    if (!email || status === 'loading') return
    setStatus('loading')
    try {
      const res = await fetch('https://api.notekit.online/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (res.ok) {
        setStatus('success')
        setMessage("You're on the list! We'll reach out when your spot is ready.")
      } else {
        setStatus('error')
        setMessage('Something went wrong. Try again?')
      }
    } catch {
      setStatus('error')
      setMessage('Network error. Check your connection and try again.')
    }
  }

  return (
    <div className="relative min-h-screen bg-black flex flex-col items-center justify-center px-6">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(234,115,23,0.08)_0%,transparent_70%)]" />

      <Link
        href="/"
        className="absolute top-6 left-6 flex items-center gap-2 text-white/60 hover:text-white transition-colors text-sm"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <rect width="24" height="24" rx="6" fill="#ea7317" />
          <path d="M16.5 4.5L7 19.5" stroke="white" strokeWidth="3.2" strokeLinecap="round" />
        </svg>
        NoteKit
      </Link>

      <div className="relative z-10 text-center max-w-lg w-full">
        <div className="inline-flex items-center gap-2 rounded-full border border-[#ea7317]/30 bg-[#ea7317]/10 px-3 py-1 text-xs text-[#ea7317] mb-6">
          <span className="size-1.5 rounded-full bg-[#ea7317] animate-pulse" />
          Limited early access
        </div>

        <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">Get early access</h1>
        <p className="text-white/50 text-lg mb-10 leading-relaxed">
          Be among the first to try NoteKit. We&apos;ll notify you when your spot is ready — no spam,
          unsubscribe anytime.
        </p>

        {status === 'success' ? (
          <div className="rounded-xl border border-[#ea7317]/20 bg-[#ea7317]/10 p-6 text-[#ea7317]">
            {message}
          </div>
        ) : (
          <div className="w-full max-w-sm mx-auto">
            <InputButtonProvider className="w-full">
              <InputButtonAction>Join the waitlist</InputButtonAction>
              <InputButtonInput
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void handleSubmit()}
              />
              <InputButtonSubmit onClick={() => void handleSubmit()}>
                {status === 'loading' ? 'Joining…' : 'Join'}
              </InputButtonSubmit>
            </InputButtonProvider>
            {status === 'error' && (
              <p className="mt-3 text-sm text-red-400">{message}</p>
            )}
          </div>
        )}

        <p className="mt-8 text-white/30 text-xs">
          By joining, you agree to our{' '}
          <Link
            href="https://notekit.online/privacy"
            className="underline hover:text-white/50 transition-colors"
          >
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </div>
  )
}
