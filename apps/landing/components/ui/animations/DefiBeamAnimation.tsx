"use client"

import React, { forwardRef, useRef } from "react"
import Image from "next/image"
import { Wallet, User } from "lucide-react"
import { cn } from "@/lib/utils"
import { AnimatedBeam } from "@/components/ui/animated-beam"

// Types
interface DefiBeamAnimationProps {
  className?: string
  duration?: number
  gradientStartColor?: string
  gradientStopColor?: string
}

interface CircleProps {
  className?: string
  children?: React.ReactNode
}

// Constants
const DEFAULT_DURATION = 8
const DEFAULT_GRADIENT_START = "#ED6918"
const DEFAULT_GRADIENT_STOP = "#FFA500"

const DEFI_ACTIONS = [
  { id: "deposit", icon: "/images/icon/Deposit.webp", alt: "Deposit" },
  { id: "earn", icon: "/images/icon/Earn.webp", alt: "Earn" },
  { id: "yield", icon: "/images/icon/Yield.webp", alt: "Yield" },
  { id: "trade", icon: "/images/icon/Trade.webp", alt: "Trade" },
] as const

// Components
const Circle = forwardRef<HTMLDivElement, CircleProps>(
  ({ className, children }, ref) => (
    <div
      ref={ref}
      className={cn(
        "z-10 flex size-12 items-center justify-center rounded-full border-2 bg-white p-3 shadow-[0_0_20px_-12px_rgba(0,0,0,0.8)]",
        className
      )}
    >
      {children}
    </div>
  )
)

Circle.displayName = "Circle"

export function DefiBeamAnimation({
  className,
  duration = DEFAULT_DURATION,
  gradientStartColor = DEFAULT_GRADIENT_START,
  gradientStopColor = DEFAULT_GRADIENT_STOP
}: DefiBeamAnimationProps) {
  // Refs
  const containerRef = useRef<HTMLDivElement>(null)
  const userRef = useRef<HTMLDivElement>(null)
  const walletRef = useRef<HTMLDivElement>(null)
  const actionRefs = {
    deposit: useRef<HTMLDivElement>(null),
    earn: useRef<HTMLDivElement>(null),
    yield: useRef<HTMLDivElement>(null),
    trade: useRef<HTMLDivElement>(null),
  }

  // Beam configuration
  const beamProps = {
    containerRef,
    duration,
    gradientStartColor,
    gradientStopColor,
  }

  return (
    <div
      className={cn(
        "relative flex h-[500px] w-full items-center justify-center overflow-hidden bg-black",
        className
      )}
      ref={containerRef}
    >
      {/* Layout Container */}
      <div className="flex size-full max-w-lg flex-row items-stretch justify-between gap-10">
        {/* User Section */}
        <div className="flex flex-col justify-center">
          <Circle ref={userRef}>
            <User className="h-6 w-6 text-black" />
          </Circle>
        </div>

        {/* Wallet Section */}
        <div className="flex flex-col justify-center">
          <Circle ref={walletRef} className="size-16">
            <Wallet className="h-6 w-6 text-black" />
          </Circle>
        </div>

        {/* DeFi Actions Section */}
        <div className="flex flex-col justify-center gap-2">
          {DEFI_ACTIONS.map((action) => (
            <Circle key={action.id} ref={actionRefs[action.id]} className="size-14">
              <Image
                src={action.icon}
                alt={action.alt}
                width={48}
                height={48}
                className="object-contain"
              />
            </Circle>
          ))}
        </div>
      </div>

      {/* Animated Beams */}
      {DEFI_ACTIONS.map((action) => (
        <AnimatedBeam
          key={`${action.id}-to-wallet`}
          {...beamProps}
          fromRef={actionRefs[action.id]}
          toRef={walletRef}
        />
      ))}

      <AnimatedBeam
        {...beamProps}
        fromRef={walletRef}
        toRef={userRef}
      />
    </div>
  )
}