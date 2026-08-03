"use client"

import { useRef } from "react"
import { AnimatedBeam } from "./ui/animated-beam"

export default function TradeBeamHeader() {
  const containerRef = useRef<HTMLDivElement>(null)
  const tradeRef = useRef<HTMLDivElement>(null)
  const lendingRef = useRef<HTMLDivElement>(null)
  const predictionRef = useRef<HTMLDivElement>(null)

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full items-center justify-center gap-20 px-10"
    >
      {/* Left: Trade */}
      <div
        ref={tradeRef}
        className="z-10 flex flex-col items-center gap-3"
      >
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-white/10 bg-neutral-900 shadow-lg">
          <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m16 3 4 4-4 4" />
            <path d="M20 7H4" />
            <path d="m8 21-4-4 4-4" />
            <path d="M4 17h16" />
          </svg>
        </div>
        <span className="text-xs text-white/60 font-medium tracking-wide">TRADE</span>
      </div>

      {/* Center: Lending Protocol */}
      <div
        ref={lendingRef}
        className="z-10 flex flex-col items-center gap-3"
      >
        <div className="flex h-24 w-24 items-center justify-center rounded-2xl border-2 border-primary/30 shadow-lg"
          style={{ background: "linear-gradient(189deg, #252525 5.97%, #0E0E0E 92.92%)", boxShadow: "0 0 40px rgba(240,103,24,0.25)" }}>
          <svg className="w-12 h-12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11.12 2.198a2 2 0 0 1 1.76.006l7.866 3.847c.476.233.31.949-.22.949H3.474c-.53 0-.695-.716-.22-.949z" />
            <path d="M6 18v-7" />
            <path d="M10 18v-7" />
            <path d="M14 18v-7" />
            <path d="M18 18v-7" />
            <path d="M3 22h18" />
          </svg>
        </div>
        <span className="text-xs text-primary font-semibold tracking-wide">LENDING</span>
      </div>

      {/* Right: Prediction */}
      <div
        ref={predictionRef}
        className="z-10 flex flex-col items-center gap-3"
      >
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-white/10 bg-neutral-900 shadow-lg">
          <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 7h6v6" />
            <path d="m22 7-8.5 8.5-5-5L2 17" />
          </svg>
        </div>
        <span className="text-xs text-white/60 font-medium tracking-wide">PREDICT</span>
      </div>

      {/* Beam: Trade → Lending (yield flows in) */}
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={tradeRef}
        toRef={lendingRef}
        curvature={-50}
        gradientStartColor="#F97316"
        gradientStopColor="#F5955D"
        pathColor="rgba(255,255,255,0.6)"
        pathWidth={3}
        duration={4}
      />

      {/* Beam: Lending → Trade (yield flows back) */}
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={lendingRef}
        toRef={tradeRef}
        curvature={50}
        reverse
        gradientStartColor="#F97316"
        gradientStopColor="#F5955D"
        pathColor="rgba(255,255,255,0.6)"
        pathWidth={3}
        duration={4}
        delay={1}
      />

      {/* Beam: Prediction → Lending (yield flows in) */}
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={predictionRef}
        toRef={lendingRef}
        curvature={50}
        gradientStartColor="#F97316"
        gradientStopColor="#F5955D"
        pathColor="rgba(255,255,255,0.6)"
        pathWidth={3}
        duration={4}
        delay={2}
      />

      {/* Beam: Lending → Prediction (yield flows back) */}
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={lendingRef}
        toRef={predictionRef}
        curvature={-50}
        reverse
        gradientStartColor="#F97316"
        gradientStopColor="#F5955D"
        pathColor="rgba(255,255,255,0.6)"
        pathWidth={3}
        duration={4}
        delay={3}
      />
    </div>
  )
}
