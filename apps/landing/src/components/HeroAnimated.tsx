"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
}

function useHydrated() {
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    // Remove the CSS hide class from parent
    const el = document.querySelector(".hero-animate-init")
    if (el) el.classList.remove("hero-animate-init")
    setHydrated(true)
  }, [])
  return hydrated
}

export function HeroContent({ children }: { children: React.ReactNode }) {
  const hydrated = useHydrated()

  return (
    <motion.div
      initial="hidden"
      animate={hydrated ? "visible" : "hidden"}
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.2 } },
      }}
      className="flex flex-col gap-6 items-start"
    >
      {children}
    </motion.div>
  )
}

export function HeroItem({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div variants={itemVariants} className={className}>
      {children}
    </motion.div>
  )
}

export function HeroRight({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => { setHydrated(true) }, [])

  return (
    <motion.div
      initial="hidden"
      animate={hydrated ? "visible" : "hidden"}
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.2, delayChildren: 0.4 } },
      }}
      className="flex flex-col gap-6 sm:gap-8 w-full lg:w-[560px]"
    >
      {children}
    </motion.div>
  )
}

export function HeroRightItem({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div variants={itemVariants} className={className}>
      {children}
    </motion.div>
  )
}
