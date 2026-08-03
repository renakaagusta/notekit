"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "../lib/utils"
import type { FAQItem } from "../data/faq-data"

interface FAQAccordionProps {
  items: FAQItem[]
  className?: string
}

export function FAQAccordion({ items, className }: FAQAccordionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  const toggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index)
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {items.map((item, index) => {
        const isOpen = openIndex === index
        return (
          <div
            key={index}
            className={cn(
              "rounded-xl border transition-all duration-300",
              isOpen
                ? "bg-[#111318] border-white/30 border-l-2 border-l-white shadow-[0_0_20px_rgba(255,255,255,0.06)]"
                : "bg-[#111318] border-white/5 hover:border-white/20 hover:shadow-[0_0_15px_rgba(255,255,255,0.04)]"
            )}
          >
            <button
              onClick={() => toggle(index)}
              aria-expanded={isOpen}
              className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left cursor-pointer"
            >
              <span
                className={cn(
                  "text-[15px] font-medium font-['Schibsted_Grotesk'] transition-colors",
                  isOpen ? "text-white" : "text-neutral-200"
                )}
              >
                {item.question}
              </span>
              <div className="relative w-5 h-5 flex-shrink-0 flex items-center justify-center">
                {/* Horizontal bar (always visible) */}
                <span
                  className={cn(
                    "absolute w-3.5 h-[1.5px] rounded-full transition-colors",
                    isOpen ? "bg-primary" : "bg-neutral-400"
                  )}
                />
                {/* Vertical bar (rotates to 0 when open) */}
                <motion.span
                  animate={{ rotate: isOpen ? 0 : 90 }}
                  transition={{ duration: 0.2 }}
                  className={cn(
                    "absolute w-3.5 h-[1.5px] rounded-full rotate-90",
                    isOpen ? "bg-primary" : "bg-neutral-400"
                  )}
                />
              </div>
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  role="region"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                  className="overflow-hidden"
                >
                  <p className="px-5 pb-4 text-sm text-neutral-400 font-body leading-relaxed">
                    {item.answer}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )
      })}
    </div>
  )
}
