'use client'

import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { NeuroNoise } from '@paper-design/shaders-react'
import { Navbar } from './Navbar'
import { Feature } from './Feature'
import { HowItWork } from './HowItWork'
import { IntegrationsMarquee } from './IntegrationsMarquee'
import { PrivacyFlywheelSection } from './PrivacyFlywheelSection'
import { CTA } from './CTA'
import { Footer } from './Footer'
import { LaunchAppButton } from '@/components/ui/animations/LaunchAppButton'

gsap.registerPlugin(ScrollTrigger)

export default function Landing() {
  const heroRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.to('.hero-bg', {
        scale: 1.08,
        borderRadius: '0px',
        scrollTrigger: {
          trigger: heroRef.current,
          start: 'top top',
          end: 'bottom top',
          scrub: true,
        },
      })

      gsap.from('.hero-content > *', {
        opacity: 0,
        y: 30,
        stagger: 0.15,
        duration: 1,
        ease: 'power3.out',
        delay: 0.3,
      })
    }, containerRef)

    return () => ctx.revert()
  }, [])

  return (
    <div ref={containerRef} className="relative bg-black min-h-screen">
      <Navbar />

      {/* Hero */}
      <section
        ref={heroRef}
        className="relative min-h-screen flex items-center justify-center overflow-hidden"
      >
        {/* Shader background */}
        <div
          className="hero-bg absolute inset-0"
          style={{ borderRadius: '24px', overflow: 'hidden', margin: '12px' }}
        >
          <NeuroNoise
            style={{ width: '100%', height: '100%' }}
            colorBack="#000000"
            colorMid="#1a0800"
            colorFront="#ea7317"
            speed={0.4}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/80" />
        </div>

        {/* Content */}
        <div className="hero-content relative z-10 text-center px-6 max-w-4xl mx-auto pt-24">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#ea7317]/30 bg-[#ea7317]/10 px-4 py-1.5 text-sm text-[#ea7317] mb-8">
            <span className="size-1.5 rounded-full bg-[#ea7317] animate-pulse" />
            Open source · E2EE · Git-native
          </div>

          <h1 className="text-5xl md:text-7xl font-bold text-white leading-tight mb-6">
            Your notes.<br />
            <span className="text-[#ea7317]">Your keys.</span>
          </h1>

          <p className="text-white/60 text-xl md:text-2xl mb-10 leading-relaxed max-w-2xl mx-auto">
            End-to-end encrypted notes, tickets, and links — synced via Git.
            Works offline. No lock-in. Fully open source.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <LaunchAppButton text="Open App" />
            <a
              href="/waitlist"
              className="text-white/60 hover:text-white text-sm transition-colors border border-white/10 hover:border-white/20 rounded-full px-6 py-2.5"
            >
              Join waitlist →
            </a>
          </div>
        </div>
      </section>

      <Feature />
      <HowItWork />
      <IntegrationsMarquee />
      <PrivacyFlywheelSection />
      <CTA />
      <Footer />
    </div>
  )
}
