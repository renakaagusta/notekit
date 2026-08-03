'use client'

import { useRef } from 'react'
import { AnimatedBeam } from '@/components/ui/animated-beam'
import { Lock, FileText, RefreshCw, Server, Smartphone, Laptop } from 'lucide-react'

function Circle({
  children,
  className = '',
  forwardRef,
}: {
  children: React.ReactNode
  className?: string
  forwardRef?: React.RefObject<HTMLDivElement>
}) {
  return (
    <div
      ref={forwardRef}
      className={`z-10 flex size-14 items-center justify-center rounded-full border border-white/10 bg-white/5 backdrop-blur-sm shadow-lg ${className}`}
    >
      {children}
    </div>
  )
}

export function NoteBeamAnimation() {
  const containerRef = useRef<HTMLDivElement>(null)
  const noteRef = useRef<HTMLDivElement>(null)
  const encryptRef = useRef<HTMLDivElement>(null)
  const gitRef = useRef<HTMLDivElement>(null)
  const desktopRef = useRef<HTMLDivElement>(null)
  const mobileRef = useRef<HTMLDivElement>(null)
  const serverRef = useRef<HTMLDivElement>(null)

  return (
    <div
      ref={containerRef}
      className="relative flex h-72 w-full items-center justify-center overflow-hidden"
    >
      {/* Left: source note */}
      <div className="flex flex-col gap-6 items-center mr-16">
        <Circle forwardRef={noteRef}>
          <FileText size={22} className="text-white/80" />
        </Circle>
      </div>

      {/* Center: E2EE */}
      <div className="flex flex-col items-center">
        <Circle
          forwardRef={encryptRef}
          className="size-16 border-[#ea7317]/40 bg-[#ea7317]/10"
        >
          <Lock size={24} className="text-[#ea7317]" />
        </Circle>
        <p className="mt-2 text-xs text-white/40 font-medium">E2EE</p>
      </div>

      {/* Right: sync targets */}
      <div className="flex flex-col gap-4 items-center ml-16">
        <Circle forwardRef={gitRef}>
          <RefreshCw size={18} className="text-white/80" />
        </Circle>
        <Circle forwardRef={desktopRef}>
          <Laptop size={18} className="text-white/80" />
        </Circle>
        <Circle forwardRef={mobileRef}>
          <Smartphone size={18} className="text-white/80" />
        </Circle>
        <Circle forwardRef={serverRef}>
          <Server size={18} className="text-white/80" />
        </Circle>
      </div>

      <AnimatedBeam
        containerRef={containerRef}
        fromRef={noteRef}
        toRef={encryptRef}
        gradientStartColor="#ea7317"
        gradientStopColor="#ff9f58"
        duration={3}
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={encryptRef}
        toRef={gitRef}
        gradientStartColor="#ea7317"
        gradientStopColor="#ff9f58"
        duration={3}
        delay={0.5}
        curvature={-30}
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={encryptRef}
        toRef={desktopRef}
        gradientStartColor="#ea7317"
        gradientStopColor="#ff9f58"
        duration={3}
        delay={1}
        curvature={-10}
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={encryptRef}
        toRef={mobileRef}
        gradientStartColor="#ea7317"
        gradientStopColor="#ff9f58"
        duration={3}
        delay={1.5}
        curvature={10}
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={encryptRef}
        toRef={serverRef}
        gradientStartColor="#ea7317"
        gradientStopColor="#ff9f58"
        duration={3}
        delay={2}
        curvature={30}
      />
    </div>
  )
}
