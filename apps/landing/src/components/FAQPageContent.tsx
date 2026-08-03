"use client"

import { useState, useEffect, useRef } from "react"
import { FAQAccordion } from "./FAQAccordion"
import { faqCategories } from "../data/faq-data"
import { FadeIn } from "./ui/fade-in"
import { cn } from "../lib/utils"

export default function FAQPageContent() {
  const [activeCategory, setActiveCategory] = useState(faqCategories[0].id)
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveCategory(entry.target.id)
          }
        }
      },
      { rootMargin: "-20% 0px -60% 0px" }
    )

    for (const cat of faqCategories) {
      const el = sectionRefs.current[cat.id]
      if (el) observer.observe(el)
    }

    return () => observer.disconnect()
  }, [])

  const scrollToCategory = (id: string) => {
    const el = sectionRefs.current[id]
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#050505" }}>
      {/* Hero */}
      <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-[120px] pt-16 pb-10">
        <FadeIn>
          <a
            href="/"
            className="inline-flex items-center gap-1.5 text-neutral-400 text-sm font-body hover:text-white transition-colors mb-8"
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back to Home
          </a>
          <h1 className="text-[36px] sm:text-[48px] font-['Schibsted_Grotesk'] font-semibold text-transparent bg-clip-text bg-gradient-to-b from-white to-white/60">
            Frequently Asked Questions
          </h1>
          <p className="text-neutral-400 font-body text-base mt-4 max-w-xl leading-relaxed">
            Find answers to common questions about NoteKit — encryption, pricing, agent access, self-hosting, and more.
          </p>
        </FadeIn>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-[120px] pb-24">
        {/* Mobile category pills */}
        <div className="lg:hidden mb-8 -mx-4 px-4 overflow-x-auto scrollbar-hide">
          <div className="flex gap-2 min-w-max">
            {faqCategories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => scrollToCategory(cat.id)}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-medium font-['Schibsted_Grotesk'] whitespace-nowrap transition-all",
                  activeCategory === cat.id
                    ? "bg-primary/15 text-primary border border-primary/30"
                    : "bg-white/5 text-neutral-400 border border-white/5 hover:text-white"
                )}
              >
                {cat.title}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-10 lg:gap-16">
          {/* Desktop sidebar */}
          <nav className="hidden lg:block lg:sticky lg:top-32 lg:self-start">
            <ul className="flex flex-col gap-1">
              {faqCategories.map((cat) => (
                <li key={cat.id}>
                  <button
                    onClick={() => scrollToCategory(cat.id)}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-lg text-sm font-['Schibsted_Grotesk'] transition-all cursor-pointer",
                      activeCategory === cat.id
                        ? "text-primary bg-primary/10 font-medium"
                        : "text-neutral-400 hover:text-white hover:bg-white/5"
                    )}
                  >
                    {cat.title}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {/* FAQ sections */}
          <div className="flex flex-col gap-14">
            {faqCategories.map((cat) => (
              <section
                key={cat.id}
                id={cat.id}
                ref={(el) => { sectionRefs.current[cat.id] = el }}
                className="scroll-mt-32"
              >
                <h2 className="text-xl font-['Schibsted_Grotesk'] font-semibold text-white mb-5">
                  {cat.title}
                </h2>
                <FAQAccordion items={cat.items} />
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
