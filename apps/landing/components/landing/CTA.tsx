import { LaunchAppButton } from '@/components/ui/animations/LaunchAppButton'
import Link from 'next/link'

export function CTA() {
  return (
    <section className="py-32 px-6 text-center">
      <div className="max-w-2xl mx-auto">
        <p className="text-[#ea7317] text-sm font-semibold uppercase tracking-widest mb-4">Get started</p>
        <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
          Your notes. Your keys.<br />Nobody else&apos;s business.
        </h2>
        <p className="text-white/50 text-lg mb-10 leading-relaxed">
          NoteKit is free and open source. Sync to your own Git repo,
          <br className="hidden md:block" />
          or use our managed vault with a generous free tier.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <LaunchAppButton text="Open App" />
          <Link
            href="https://github.com/notekit-org/notekit"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white/50 hover:text-white text-sm transition-colors underline underline-offset-4"
          >
            View on GitHub →
          </Link>
        </div>
      </div>
    </section>
  )
}
