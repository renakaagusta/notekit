"use client"

import { useRef } from "react"
import { AnimatedBeam } from "./ui/animated-beam"

export default function BorrowRepayBeam() {
  const containerRef = useRef<HTMLDivElement>(null)
  const limitOrderRef = useRef<HTMLDivElement>(null)
  const borrowRef = useRef<HTMLDivElement>(null)
  const repayRef = useRef<HTMLDivElement>(null)

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full items-center justify-center px-8"
    >
      {/* Top center: Limit Order */}
      <div
        ref={limitOrderRef}
        className="absolute top-8 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2"
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-neutral-900 shadow-lg">
          {/* Target/crosshair icon for limit order */}
          <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="6" />
            <circle cx="12" cy="12" r="2" />
          </svg>
        </div>
        <span className="text-[10px] text-white/60 font-medium tracking-wide">LIMIT ORDER</span>
      </div>

      {/* Bottom left: Borrow */}
      <div
        ref={borrowRef}
        className="absolute bottom-10 left-[20%] z-10 flex flex-col items-center gap-2"
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-neutral-900 shadow-lg">
          {/* Download/receive icon for borrow */}
          <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12" />
            <path d="m8 11 4 4 4-4" />
            <path d="M8 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-4" />
          </svg>
        </div>
        <span className="text-[10px] text-white/60 font-medium tracking-wide">BORROW</span>
      </div>

      {/* Bottom right: Repay */}
      <div
        ref={repayRef}
        className="absolute bottom-10 right-[20%] z-10 flex flex-col items-center gap-2"
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-neutral-900 shadow-lg">
          {/* Upload/send icon for repay */}
          <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 15V3" />
            <path d="m8 7 4-4 4 4" />
            <path d="M8 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-4" />
          </svg>
        </div>
        <span className="text-[10px] text-white/60 font-medium tracking-wide">AUTO-REPAY</span>
      </div>

      {/* Beam: Limit Order → Borrow */}
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={limitOrderRef}
        toRef={borrowRef}
        curvature={-30}
        gradientStartColor="#F97316"
        gradientStopColor="#F5955D"
        pathColor="rgba(255,255,255,0.6)"
        pathWidth={3}
        duration={4}
      />

      {/* Beam: Borrow → Repay */}
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={borrowRef}
        toRef={repayRef}
        curvature={-30}
        gradientStartColor="#F97316"
        gradientStopColor="#F5955D"
        pathColor="rgba(255,255,255,0.6)"
        pathWidth={3}
        duration={4}
        delay={1.5}
      />

      {/* Beam: Repay → Limit Order (cycle back) */}
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={repayRef}
        toRef={limitOrderRef}
        curvature={-30}
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
