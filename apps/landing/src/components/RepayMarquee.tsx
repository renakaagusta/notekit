"use client"

import { motion } from "framer-motion"

const steps = [
  { label: "Place Limit Order", icon: "target" },
  { label: "Price Hit", icon: "zap" },
  { label: "Auto-Borrow", icon: "download" },
  { label: "Yield Earned", icon: "trending" },
  { label: "Auto-Repaid", icon: "check" },
  { label: "Repeat", icon: "refresh" },
]

function StepIcon({ icon }: { icon: string }) {
  const props = {
    className: "w-4 h-4",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  }

  switch (icon) {
    case "target":
      return <svg {...props}><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>
    case "zap":
      return <svg {...props}><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" /></svg>
    case "download":
      return <svg {...props}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" /><path d="M12 15V3" /></svg>
    case "trending":
      return <svg {...props}><path d="M16 7h6v6" /><path d="m22 7-8.5 8.5-5-5L2 17" /></svg>
    case "check":
      return <svg {...props}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="m9 11 3 3L22 4" /></svg>
    case "refresh":
      return <svg {...props}><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M3 21v-5h5" /></svg>
    default:
      return null
  }
}

function StepRow() {
  return (
    <div className="flex items-center gap-3 shrink-0">
      {steps.map((step, i) => (
        <div key={step.label} className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/[0.08] bg-neutral-800/60 shrink-0">
            <span className="text-primary">
              <StepIcon icon={step.icon} />
            </span>
            <span className="text-xs text-white/80 font-medium whitespace-nowrap">
              {step.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <svg className="w-4 h-4 text-primary/40 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m9 18 6-6-6-6" />
            </svg>
          )}
        </div>
      ))}
    </div>
  )
}

export default function RepayMarquee() {
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden">
      {/* Row 1 - scrolls left */}
      <div className="flex w-full overflow-hidden py-2">
        <motion.div
          className="flex gap-3"
          animate={{ x: ["0%", "-50%"] }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: "linear",
          }}
        >
          <StepRow />
          <div className="flex items-center gap-3 shrink-0 pl-3">
            <svg className="w-4 h-4 text-primary/40 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </div>
          <StepRow />
          <div className="flex items-center gap-3 shrink-0 pl-3">
            <svg className="w-4 h-4 text-primary/40 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </div>
        </motion.div>
      </div>

      {/* Row 2 - scrolls right (reversed order) */}
      <div className="flex w-full overflow-hidden py-2">
        <motion.div
          className="flex gap-3"
          animate={{ x: ["-50%", "0%"] }}
          transition={{
            duration: 25,
            repeat: Infinity,
            ease: "linear",
          }}
        >
          <StepRow />
          <div className="flex items-center gap-3 shrink-0 pl-3">
            <svg className="w-4 h-4 text-primary/40 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </div>
          <StepRow />
          <div className="flex items-center gap-3 shrink-0 pl-3">
            <svg className="w-4 h-4 text-primary/40 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </div>
        </motion.div>
      </div>

      {/* Row 3 - scrolls left, slower */}
      <div className="flex w-full overflow-hidden py-2">
        <motion.div
          className="flex gap-3"
          animate={{ x: ["0%", "-50%"] }}
          transition={{
            duration: 30,
            repeat: Infinity,
            ease: "linear",
          }}
        >
          <StepRow />
          <div className="flex items-center gap-3 shrink-0 pl-3">
            <svg className="w-4 h-4 text-primary/40 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </div>
          <StepRow />
          <div className="flex items-center gap-3 shrink-0 pl-3">
            <svg className="w-4 h-4 text-primary/40 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </div>
        </motion.div>
      </div>

      {/* Fade edges */}
      <div className="absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-neutral-900 to-transparent z-10 pointer-events-none" />
      <div className="absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-neutral-900 to-transparent z-10 pointer-events-none" />
    </div>
  )
}
