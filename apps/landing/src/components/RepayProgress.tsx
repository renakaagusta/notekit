"use client"

import { motion } from "framer-motion"

export default function RepayProgress() {
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-6 px-8">
      {/* Circular progress */}
      <div className="relative">
        <svg width="140" height="140" viewBox="0 0 140 140">
          {/* Background circle */}
          <circle
            cx="70"
            cy="70"
            r="60"
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="8"
          />
          {/* Animated progress circle */}
          <motion.circle
            cx="70"
            cy="70"
            r="60"
            fill="none"
            stroke="url(#progress-gradient)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 60}
            strokeDashoffset={2 * Math.PI * 60}
            animate={{
              strokeDashoffset: [2 * Math.PI * 60, 0],
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              repeatDelay: 1,
              ease: "easeInOut",
            }}
            style={{ transform: "rotate(-90deg)", transformOrigin: "center" }}
          />
          <defs>
            <linearGradient id="progress-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#F06718" />
              <stop offset="100%" stopColor="#F5955D" />
            </linearGradient>
          </defs>
        </svg>
        {/* Center percentage */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            className="text-2xl font-semibold text-white"
            style={{ fontFamily: "'Schibsted Grotesk', sans-serif" }}
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 4, repeat: Infinity, repeatDelay: 1 }}
          >
            Repaying
          </motion.span>
        </div>
      </div>

      {/* Steps below */}
      <div className="flex items-center gap-3">
        {[
          { label: "Limit Order", delay: 0 },
          { label: "Price Hit", delay: 1.3 },
          { label: "Auto-Repaid", delay: 2.6 },
        ].map((step, i) => (
          <div key={step.label} className="flex items-center gap-3">
            <motion.div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-white/[0.08] bg-neutral-800/60"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{
                duration: 4,
                repeat: Infinity,
                repeatDelay: 1,
                delay: step.delay,
              }}
            >
              <motion.div
                className="w-1.5 h-1.5 rounded-full bg-primary"
                animate={{ scale: [0.8, 1.2, 0.8] }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  repeatDelay: 1,
                  delay: step.delay,
                }}
              />
              <span className="text-[10px] text-white/70 font-medium whitespace-nowrap">
                {step.label}
              </span>
            </motion.div>
            {i < 2 && (
              <svg className="w-3 h-3 text-white/20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m9 18 6-6-6-6" />
              </svg>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
