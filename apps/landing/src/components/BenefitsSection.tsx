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
    title: "Capital Efficient Trading",
    description: "Agents trade, lend, and predict in a single protocol — no idle capital, every asset works harder.",
    bgImage: "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=600&q=80",
  },
  {
    pillar: "efficiency",
    title: "Micropayments via X402",
    description: "Pay-per-action model means agents only spend on what they use — no pre-funding or locked deposits.",
    bgImage: "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=600&q=80",
  },
  {
    pillar: "safety",
    title: "On-Chain Identity (ERC-8004)",
    description: "Every agent has a verified, composable on-chain identity with reputation tracking and validation.",
    bgImage: "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=600&q=80",
  },
  {
    pillar: "safety",
    title: "On-Chain Policy Engine",
    description: "Enforced order limits, drawdown caps, and circuit breakers via Chainlink CRE keep agents within safe bounds.",
    bgImage: "https://images.unsplash.com/photo-1639322537228-f710d846310a?w=600&q=80",
  },
  {
    pillar: "transparency",
    title: "Open Agent Protocols",
    description: "Built on open standards — MCP, A2A, ERC-8004, X402 — so any agent can integrate and audit the system.",
    bgImage: "https://images.unsplash.com/photo-1620321023374-d1a68fbc720d?w=600&q=80",
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
        Agents will be the most active users of web3. ScaleX is built for them — designed around three pillars: efficiency, safety, and transparency.
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
