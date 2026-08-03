'use client'

import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const steps = [
  {
    number: '01',
    title: 'Write',
    description:
      'Create notes, journals, and tickets in a rich Markdown editor with slash commands, math blocks, and drawing support.',
  },
  {
    number: '02',
    title: 'Encrypt',
    description:
      'Every note is end-to-end encrypted with your device key before it ever leaves your machine. Zero knowledge, zero trust required.',
  },
  {
    number: '03',
    title: 'Sync',
    description:
      'Push encrypted blobs to your Git repo — GitHub, GitLab, or managed Forgejo. Pull on any device. Works offline-first.',
  },
]

function SplitText({ text }: { text: string }) {
  return (
    <>
      {text.split('').map((char, i) => (
        <span key={i} className="letter inline-block" style={{ opacity: 0 }}>
          {char}
        </span>
      ))}
    </>
  )
}

export function Feature() {
  const sectionRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      steps.forEach((_, i) => {
        const letters = sectionRef.current?.querySelectorAll(`.step-${i} .letter`)
        if (!letters || letters.length === 0) return
        gsap.to(letters, {
          opacity: 1,
          y: 0,
          stagger: 0.03,
          duration: 0.4,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: sectionRef.current?.querySelector(`.step-${i}`),
            start: 'top 75%',
            toggleActions: 'play none none reverse',
          },
        })
      })
    }, sectionRef)
    return () => ctx.revert()
  }, [])

  return (
    <section ref={sectionRef} className="relative py-32 px-6 md:px-12 max-w-6xl mx-auto">
      <p className="text-[#ea7317] text-sm font-semibold uppercase tracking-widest mb-4">How it works</p>
      <h2 className="text-4xl md:text-5xl font-bold text-white mb-20 max-w-lg">
        Private by design,<br />not by accident.
      </h2>

      <div className="space-y-24">
        {steps.map((step, i) => (
          <div key={i} className={`step-${i} flex flex-col md:flex-row gap-8 items-start`}>
            <div className="text-[#ea7317]/30 font-mono text-6xl font-bold w-24 shrink-0">
              {step.number}
            </div>
            <div>
              <h3 className="text-3xl md:text-4xl font-bold text-white mb-4">
                <SplitText text={step.title} />
              </h3>
              <p className="text-white/50 text-lg leading-relaxed max-w-xl">
                {step.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
