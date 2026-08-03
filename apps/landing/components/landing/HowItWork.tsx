'use client'

import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { GitBranch, Lock, RefreshCw, Globe } from 'lucide-react'

gsap.registerPlugin(ScrollTrigger)

const cards = [
  {
    icon: GitBranch,
    title: 'Connect your vault',
    description:
      'Link a GitHub, GitLab, or managed Forgejo repository as your vault. Bring your own repo or use our free hosted option.',
  },
  {
    icon: Lock,
    title: 'Keys stay with you',
    description:
      'Your device generates its own encryption key. A 24-word recovery phrase is the only backup. We never see it.',
  },
  {
    icon: RefreshCw,
    title: 'Git-native sync',
    description:
      'Notes are encrypted age blobs committed to Git. Full history, conflict resolution, and branching — all standard Git.',
  },
  {
    icon: Globe,
    title: 'Access everywhere',
    description:
      'Desktop app, web, iOS, Android, and CLI. All surfaces read the same encrypted vault with the same key.',
  },
]

export function HowItWork() {
  const sectionRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('.how-card', {
        opacity: 0,
        y: 40,
        stagger: 0.15,
        duration: 0.7,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'top 70%',
        },
      })
    }, sectionRef)
    return () => ctx.revert()
  }, [])

  return (
    <section ref={sectionRef} className="py-24 px-6 md:px-12 max-w-6xl mx-auto">
      <p className="text-[#ea7317] text-sm font-semibold uppercase tracking-widest mb-4">Built different</p>
      <h2 className="text-3xl md:text-4xl font-bold text-white mb-12 max-w-lg">
        Everything you need, nothing you don&apos;t.
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {cards.map((card, i) => (
          <div
            key={i}
            className="how-card rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 hover:border-[#ea7317]/30 hover:bg-white/5 transition-all duration-300"
          >
            <div className="mb-5 inline-flex size-12 items-center justify-center rounded-xl bg-[#ea7317]/10 border border-[#ea7317]/20">
              <card.icon size={22} className="text-[#ea7317]" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-3">{card.title}</h3>
            <p className="text-white/50 leading-relaxed">{card.description}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
