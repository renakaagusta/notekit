'use client'

import Link from 'next/link'
import { LaunchAppButton } from '@/components/ui/animations/LaunchAppButton'

function NotekitLogo() {
  return (
    <Link href="/" className="flex items-center gap-2 select-none">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="24" height="24" rx="6" fill="#ea7317" />
        <path d="M16.5 4.5L7 19.5" stroke="white" strokeWidth="3.2" strokeLinecap="round" />
      </svg>
      <span className="text-white font-bold text-lg tracking-tight">NoteKit</span>
    </Link>
  )
}

export function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 md:px-12">
      <NotekitLogo />

      <div className="hidden md:flex items-center gap-1 rounded-full border border-white/10 bg-black/40 backdrop-blur-md px-2 py-1.5">
        <Link
          href="https://github.com/notekit-org/notekit"
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-1.5 text-sm text-white/70 hover:text-white transition-colors rounded-full hover:bg-white/5"
        >
          GitHub
        </Link>
        <Link
          href="/waitlist"
          className="px-4 py-1.5 text-sm text-white/70 hover:text-white transition-colors rounded-full hover:bg-white/5"
        >
          Waitlist
        </Link>
      </div>

      <LaunchAppButton text="Open App" />
    </nav>
  )
}
