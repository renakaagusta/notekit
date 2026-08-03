"use client"

import { useRef } from "react"
import { TextReveal } from "./ui/text-reveal"
import { motion, useScroll, useTransform } from "framer-motion"
import { cn } from "../lib/utils"
import { PixelatedCanvas } from "./ui/pixelated-canvas"

interface BenefitCard {
  title: string
  description: string
  pillar: "efficiency" | "safety" | "transparency"
  bgImage: string
}

const benefits: BenefitCard[] = [
  {
    pillar: "efficiency",
    title: "End-to-End Encrypted",
    description: "age encrypts every note on your device before sync. The server sees only ciphertext. Zero-knowledge, always.",
    bgImage: "https://images.unsplash.com/photo-1614064641938-3bbee52942c7?w=600&q=80",
  },
  {
    pillar: "efficiency",
    title: "Offline-First",
    description: "Write anywhere, no signal needed. NoteKit queues changes locally and Git-syncs the moment you reconnect.",
    bgImage: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&q=80",
  },
  {
    pillar: "safety",
    title: "Git-Backed History",
    description: "Every save is a commit. Full diff, blame, and rollback — on your own repo. No proprietary format, no lock-in.",
    bgImage: "https://images.unsplash.com/photo-1556075798-4825dfaaf498?w=600&q=80",
  },
  {
    pillar: "safety",
    title: "MCP Agent Access",
    description: "Grant Claude or any MCP client access to specific notes. Least-privilege by default. Revoke any time.",
    bgImage: "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=600&q=80",
  },
  {
    pillar: "transparency",
    title: "Open Standards Only",
    description: "age encryption, Git, Markdown, MCP — every component is open, auditable, and replaceable. No vendor lock-in.",
    bgImage: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=600&q=80",
  },
]

function OverlayCard({ card }: { card: BenefitCard }) {
  return (
    <div
      className={cn(
        "group flex-shrink-0 w-[300px] md:w-[350px] cursor-pointer overflow-hidden relative h-[420px] rounded-2xl shadow-xl flex flex-col justify-end p-6 border-0",
        "transition-all duration-500"
      )}
    >
      {/* Pixelated canvas background */}
      <div className="absolute inset-0">
        <PixelatedCanvas
          src={card.bgImage}
          width={350}
          height={420}
          cellSize={3}
          dotScale={0.9}
          shape="square"
          backgroundColor="#0a0a0a"
          grayscale
          interactive
          distortionStrength={3}
          distortionRadius={80}
          distortionMode="swirl"
          followSpeed={0.2}
          jitterStrength={4}
          jitterSpeed={4}
          sampleAverage
          dropoutStrength={0.3}
          tintColor="#F97316"
          tintStrength={0.1}
          className="w-full h-full"
        />
      </div>

      {/* Dark gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

      {/* Content */}
      <div className="relative z-10">
        <h3 className="font-bold text-lg md:text-xl text-gray-50 mb-1.5" style={{ fontFamily: "'Schibsted Grotesk', sans-serif" }}>
          {card.title}
        </h3>
        <p className="text-sm text-gray-300 leading-relaxed">
          {card.description}
        </p>
      </div>
    </div>
  )
}

export default function BenefitsSection() {
  const containerRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  })

  const x = useTransform(scrollYProgress, [0, 1], ["0%", "-65%"])

  return (
    <section style={{ backgroundColor: "#050505" }}>
      {/* Text Reveal */}
      <TextReveal>
        NoteKit is built for writers who want privacy and agents who need context — designed around three pillars: encryption, portability, and openness.
      </TextReveal>

      {/* Combined carousel — tall scroll container with sticky pin */}
      <div ref={containerRef} className="relative h-[180vh] md:h-[300vh]">
        <div className="sticky top-0 h-screen flex items-center overflow-hidden">
          <motion.div
            style={{ x }}
            className="flex gap-6 pl-4 sm:pl-8 lg:pl-[120px]"
          >
            {benefits.map((card, i) => (
              <OverlayCard key={i} card={card} />
            ))}
          </motion.div>
        </div>
      </div>

    </section>
  )
}
