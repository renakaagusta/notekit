"use client"

import { FAQAccordion } from "./FAQAccordion"
import { landingFAQs } from "../data/faq-data"
import { FadeIn, StaggerContainer, StaggerItem } from "./ui/fade-in"

export default function FAQSection() {
  return (
    <section className="py-16 lg:py-24" style={{ backgroundColor: "#050505" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-[120px]">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-10 lg:gap-16">
          {/* Left column */}
          <FadeIn className="lg:sticky lg:top-32 lg:self-start">
            <div className="flex flex-col gap-4">
              <h2 className="text-[32px] sm:text-[40px] font-['Schibsted_Grotesk'] font-semibold text-transparent bg-clip-text bg-gradient-to-b from-white to-white/60">
                FAQs
              </h2>
              <p className="text-neutral-400 font-body text-sm leading-relaxed max-w-[280px]">
                Everything you need to know about NoteKit. Can't find what you're looking for?
              </p>
              {/* <a
                href="/faq"
                className="inline-flex items-center gap-1.5 text-primary text-sm font-medium font-['Schibsted_Grotesk'] hover:underline mt-2 group"
              >
                See More
                <svg
                  className="w-4 h-4 transition-transform group-hover:translate-x-0.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </a> */}
            </div>
          </FadeIn>

          {/* Right column */}
          <StaggerContainer stagger={0.08}>
            <StaggerItem>
              <FAQAccordion items={landingFAQs} />
            </StaggerItem>
          </StaggerContainer>
        </div>
      </div>
    </section>
  )
}
