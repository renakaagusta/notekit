"use client"

import React, { useRef } from "react"
import { motion, useScroll, useTransform } from "framer-motion"
import { cn } from "../../lib/utils"

interface CarouselCard {
  icon: React.ReactNode
  title: string
  description: string
}

interface AppleCarouselProps {
  label: string
  cards: CarouselCard[]
  className?: string
}

export const AppleCarousel: React.FC<AppleCarouselProps> = ({ label, cards, className }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  })

  const x = useTransform(scrollYProgress, [0, 1], ["10%", "-40%"])

  return (
    <div ref={containerRef} className={cn("overflow-hidden py-8", className)}>
      {/* Label */}
      <div className="max-w-[1200px] mx-auto px-4 sm:px-8 lg:px-[120px] mb-6">
        <span className="text-sm uppercase tracking-widest text-primary/80 font-medium px-3 py-1 rounded-full border border-primary/20 bg-primary/5">
          {label}
        </span>
      </div>

      {/* Scrolling cards */}
      <motion.div
        style={{ x }}
        className="flex gap-6 pl-4 sm:pl-8 lg:pl-[120px]"
      >
        {cards.map((card, i) => (
          <div
            key={i}
            className="flex-shrink-0 w-[320px] md:w-[380px] rounded-2xl border border-white/[0.08] p-6 md:p-8"
            style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)" }}
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center border border-white/10 mb-5" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
              <div className="text-primary">
                {card.icon}
              </div>
            </div>
            <h3 className="text-lg md:text-xl font-medium text-white mb-2" style={{ fontFamily: "'Schibsted Grotesk', sans-serif" }}>
              {card.title}
            </h3>
            <p className="text-sm text-neutral-400 leading-relaxed">
              {card.description}
            </p>
          </div>
        ))}
      </motion.div>
    </div>
  )
}
