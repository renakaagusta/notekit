"use client"

import React, { useRef } from "react"
import { motion, useScroll, useTransform } from "framer-motion"
import type { MotionValue } from "framer-motion"
import { cn } from "../../lib/utils"

export interface TextRevealProps {
  children: string
  className?: string
}

export const TextReveal: React.FC<TextRevealProps> = ({ children, className }) => {
  const targetRef = useRef<HTMLDivElement | null>(null)
  const { scrollYProgress } = useScroll({
    target: targetRef,
  })

  const words = children.split(" ")

  return (
    <div ref={targetRef} className={cn("relative z-0 h-[150vh] md:h-[250vh]", className)}>
      <div className="sticky top-0 mx-auto flex h-screen max-w-4xl items-center bg-transparent px-4 py-20">
        <span className="flex flex-wrap p-5 text-2xl font-bold text-white/20 md:p-8 md:text-3xl lg:p-10 lg:text-4xl xl:text-5xl">
          {words.map((word, i) => {
            // Compress all reveals into 0–0.8 of scroll so they all finish before scrolling out
            const start = (i / words.length) * 0.6
            const end = ((i + 1) / words.length) * 0.6
            return (
              <Word key={i} progress={scrollYProgress} range={[start, end]}>
                {word}
              </Word>
            )
          })}
        </span>
      </div>
    </div>
  )
}

interface WordProps {
  children: React.ReactNode
  progress: MotionValue<number>
  range: [number, number]
}

const Word: React.FC<WordProps> = ({ children, progress, range }) => {
  const opacity = useTransform(progress, range, [0, 1])
  return (
    <span className="xl:lg-3 relative mx-1 lg:mx-1.5">
      <span className="absolute opacity-30">{children}</span>
      <motion.span style={{ opacity }} className="text-white">
        {children}
      </motion.span>
    </span>
  )
}
