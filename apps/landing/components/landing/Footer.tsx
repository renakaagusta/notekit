import Link from 'next/link'

function NotekitLogo() {
  return (
    <div className="flex items-center gap-2">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="24" height="24" rx="6" fill="#ea7317" />
        <path d="M16.5 4.5L7 19.5" stroke="white" strokeWidth="3.2" strokeLinecap="round" />
      </svg>
      <span className="text-white font-bold text-base">NoteKit</span>
    </div>
  )
}

export function Footer() {
  return (
    <footer className="border-t border-white/[0.08] py-12 px-6 md:px-12">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
        <div>
          <NotekitLogo />
          <p className="text-white/30 text-sm mt-2 max-w-xs">
            Private notes, encrypted by default. Open source under MIT + AGPL.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm text-white/40">
          <Link href="https://app.notekit.online" className="hover:text-white transition-colors">
            App
          </Link>
          <Link
            href="https://github.com/notekit-org/notekit"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors"
          >
            GitHub
          </Link>
          <Link href="/waitlist" className="hover:text-white transition-colors">
            Waitlist
          </Link>
          <Link href="https://notekit.online/privacy" className="hover:text-white transition-colors">
            Privacy
          </Link>
          <Link href="https://notekit.online/terms" className="hover:text-white transition-colors">
            Terms
          </Link>
        </div>
      </div>
      <div className="max-w-6xl mx-auto mt-8 pt-6 border-t border-white/5 text-white/20 text-xs">
        © 2025 NoteKit. MIT-licensed client, AGPL-licensed server.
      </div>
    </footer>
  )
}
