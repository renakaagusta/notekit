import type { Metadata } from 'next'
import { Hanken_Grotesk } from 'next/font/google'
import './globals.css'

const hanken = Hanken_Grotesk({
  subsets: ['latin'],
  variable: '--font-hanken',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'NoteKit — Private notes, zero compromise',
  description: 'End-to-end encrypted notes, tickets, and links. Synced via Git. Works offline. Open source.',
  openGraph: {
    title: 'NoteKit — Private notes, zero compromise',
    description: 'End-to-end encrypted notes, tickets, and links. Synced via Git. Works offline. Open source.',
    url: 'https://notekit.online',
    siteName: 'NoteKit',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NoteKit — Private notes, zero compromise',
    description: 'End-to-end encrypted notes, tickets, and links. Synced via Git. Works offline. Open source.',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={hanken.variable}>
      <body style={{ fontFamily: 'var(--font-hanken), system-ui, -apple-system, sans-serif' }}>
        {children}
      </body>
    </html>
  )
}
