'use client';

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { DefiBeamAnimation } from '@/components/ui/animations/DefiBeamAnimation';
import { DottedMap } from '@/components/ui/dotted-map';

interface ProgressItem {
  label: string;
  percentage: number;
}

interface ChecklistItem {
  task: string;
  completed: boolean;
}

interface Metric {
  label: string;
  value: string;
  change: string;
  positive: boolean;
}

interface StepContent {
  type: "metrics" | "progress" | "checklist" | "tracker" | "animation" | "map";
  metrics?: Metric[];
  items?: ProgressItem[] | ChecklistItem[];
  progress?: number;
}

interface Step {
  number: number;
  title: string;
  description: string;
  content: StepContent;
}

export function HowItWork() {
  const sectionRef = useRef<HTMLElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const stepLabelsRef = useRef<HTMLDivElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const cardsRef = useRef<HTMLDivElement>(null)

  const steps: Step[] = [
    {
      number: 1,
      title: "Connect Wallet",
      description: "Connect your wallet to create your trading account.",
      content: {
        type: "animation",
      },
    },
    {
      number: 2,
      title: "Deposit & Earn",
      description:
        "Deposit assets like USDC to our Balance Manager contract. Your actual tokens are sent to the Lending Manager for yield and borrowing power while you receive synthetic sUSDC tokens for trading.",
      content: {
        type: "progress",
        items: [
          { label: "Yield", percentage: 12.5 },
          { label: "Volume", percentage: 89 },
          { label: "Utilization", percentage: 76 },
        ],
      },
    },
    {
      number: 3,
      title: "Trade Instantly",
      description:
        "Trade using your synthetic tokens (sUSDC) on our CLOB while your actual USDC continues earning yield. Auto-redemption occurs when orders are matched.",
      content: {
        type: "checklist",
        items: [
          { task: "Enable auto-compounding", completed: true },
          { task: "Optimize liquidity pools", completed: true },
          { task: "Configure risk parameters", completed: true },
        ],
      },
    },
    {
      number: 4,
      title: "Maximize Returns",
      description: "Monitor both your market performance and accumulated yield in real-time.",
      content: {
        type: "map",
      },
    },
  ]

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger)

    if (sectionRef.current && titleRef.current && stepLabelsRef.current && timelineRef.current && cardsRef.current) {
      // const section = sectionRef.current
      const title = titleRef.current
      const stepLabels = stepLabelsRef.current.children
      const timeline = timelineRef.current
      const cards = cardsRef.current.children

      // Set initial states
      gsap.set(title, { y: 30, opacity: 0 })
      gsap.set(stepLabels, { y: 20, opacity: 0 })
      gsap.set(timeline.children, { scale: 0, opacity: 0 })
      gsap.set(cards, { y: 50, opacity: 0 })

      // Title animation
      gsap.to(title, {
        y: 0,
        opacity: 1,
        duration: 1,
        ease: "power2.out",
        scrollTrigger: {
          trigger: title,
          start: "top 85%",
          end: "bottom 20%",
          toggleActions: "play none none reverse"
        }
      })

      // Step labels animation
      gsap.to(stepLabels, {
        y: 0,
        opacity: 1,
        duration: 0.8,
        stagger: 0.1,
        ease: "power2.out",
        scrollTrigger: {
          trigger: stepLabelsRef.current,
          start: "top 85%",
          end: "bottom 20%",
          toggleActions: "play none none reverse"
        }
      })

      // Timeline dots animation
      gsap.to(timeline.children, {
        scale: 1,
        opacity: 1,
        duration: 0.6,
        stagger: 0.15,
        ease: "back.out(1.7)",
        scrollTrigger: {
          trigger: timeline,
          start: "top 80%",
          end: "bottom 20%",
          toggleActions: "play none none reverse"
        }
      })

      // Cards staggered animation
      gsap.to(cards, {
        y: 0,
        opacity: 1,
        duration: 0.8,
        stagger: 0.2,
        ease: "power2.out",
        scrollTrigger: {
          trigger: cardsRef.current,
          start: "top 85%",
          end: "bottom 20%",
          toggleActions: "play none none reverse"
        }
      })
    }

    return () => {
      ScrollTrigger.getAll().forEach(trigger => trigger.kill())
    }
  }, [])

  return (
    <section ref={sectionRef} className="bg-[#1e1c1c] relative z-10 rounded-t-[30px] md:rounded-t-[100px]">
      <div className="px-4 sm:px-6 py-16 sm:py-24 md:px-8 lg:px-16">
        <div className="w-full mx-auto text-start">
          <h1 ref={titleRef} className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold tracking-tight text-white leading-tight text-balance">
            Earn yield while you trade.
          </h1>
        </div>
      </div>

      <div className="px-4 sm:px-6 md:px-8 lg:px-16 pb-16 sm:pb-24">
        <div className="w-full mx-auto">
          {/* Desktop: Step labels above timeline */}
          <div className="hidden lg:block mb-16">
            <div ref={stepLabelsRef} className="grid grid-cols-4 gap-6 mb-12">
              {steps.map((step) => (
                <div key={step.number} className="flex flex-col">
                  <p className="text-sm font-semibold tracking-wide text-white/80 mb-2">STEP {step.number}</p>
                  <h3 className="text-xl font-semibold text-white">{step.title}</h3>
                </div>
              ))}
            </div>

            <div ref={timelineRef} className="flex items-center gap-0 mb-16">
              {steps.map((_, index) => (
                <div key={index} className="flex items-center flex-1">
                  <div className="w-2 h-2 bg-orange-500 rounded-full" />
                  <div className="flex-1 h-px bg-white/20 mx-2" />
                </div>
              ))}
              <div className="w-2 h-2 bg-orange-500 rounded-full" />
            </div>
          </div>

          {/* Cards with integrated feature content */}
          <div ref={cardsRef} className="space-y-4 lg:grid lg:grid-cols-4 lg:gap-6 lg:space-y-0">
            {steps.map((step) => (
              <div
                key={step.number}
                className="group relative overflow-hidden rounded-2xl border border-white/10 bg-linear-to-br from-white/5 via-white/5 to-orange-500/10 p-4 sm:p-6 backdrop-blur-sm hover:border-white/20 transition-all duration-300"
              >
                {/* Mobile: Step number and title in card */}
                <div className="lg:hidden flex items-start gap-4 mb-4">
                  <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-orange-500 to-orange-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                    {step.number}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-white mb-2">{step.title}</h3>
                  </div>
                </div>

                <div className="relative z-10 space-y-4 sm:space-y-6">
                  <p className="text-sm text-white/70 leading-relaxed">{step.description}</p>

                  {step.content.type === "progress" && step.content.items && (
                    <div className="space-y-4 bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                      {(step.content.items as ProgressItem[]).map((item, idx) => (
                        <div key={idx}>
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-medium text-white">{item.label}</span>
                            <span className="text-sm font-semibold text-white">{item.percentage}%</span>
                          </div>
                          <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-linear-to-r from-orange-400 to-orange-600"
                              style={{ width: `${item.percentage}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {step.content.type === "checklist" && step.content.items && (
                    <div className="space-y-3 bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                      {(step.content.items as ChecklistItem[]).map((item, idx) => (
                        <div key={idx} className="flex items-center gap-3">
                          <div
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${item.completed ? "bg-orange-500 border-orange-500" : "border-white/30"
                              }`}
                          >
                            {item.completed && (
                              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                          <span
                            className={`text-sm ${item.completed ? "text-white opacity-60" : "text-white"
                              }`}
                          >
                            {item.task}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {step.content.type === "metrics" && step.content.metrics && (
                    <div className="space-y-4">
                      {step.content.metrics.map((metric, idx) => (
                        <div key={idx} className="flex items-center justify-between">
                          <span className="text-sm text-white/70">{metric.label}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-white">{metric.value}</span>
                            <span className="text-xs font-semibold px-2 py-1 rounded bg-emerald-500/20 text-emerald-300">
                              {metric.change}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {step.content.type === "tracker" && step.content.progress !== undefined && (
                    <div className="space-y-4">
                      <div className="text-center">
                        <p className="text-4xl font-bold text-white">{step.content.progress}%</p>
                        <p className="text-xs text-white/70 mt-1">Progress Tracker</p>
                      </div>
                      <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-linear-to-r from-orange-400 to-orange-600"
                          style={{ width: `${step.content.progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {step.content.type === "animation" && (
                    <div className="w-full hidden sm:block">
                      <DefiBeamAnimation
                        className="h-[200px] lg:h-[300px] bg-transparent"
                        duration={6}
                        gradientStartColor="#ED6918"
                        gradientStopColor="#FFA500"
                      />
                    </div>
                  )}

                  {step.content.type === "map" && (
                    <div className="w-full bg-black/5 rounded-xl p-2 sm:p-4 border border-white/10 hidden sm:block">
                      <DottedMap markers={[
                        { lat: 40.7128, lng: -74.006, size: 0.3 }, // New York
                        { lat: 34.0522, lng: -118.2437, size: 0.3 }, // Los Angeles
                        { lat: 51.5074, lng: -0.1278, size: 0.3 }, // London
                        { lat: -33.8688, lng: 151.2093, size: 0.3 }, // Sydney
                        { lat: 48.8566, lng: 2.3522, size: 0.3 }, // Paris
                        { lat: 35.6762, lng: 139.6503, size: 0.3 }, // Tokyo
                        { lat: 55.7558, lng: 37.6176, size: 0.3 }, // Moscow
                        { lat: 39.9042, lng: 116.4074, size: 0.3 }, // Beijing
                        { lat: 28.6139, lng: 77.209, size: 0.3 }, // New Delhi
                        { lat: -23.5505, lng: -46.6333, size: 0.3 }, // São Paulo
                        { lat: 1.3521, lng: 103.8198, size: 0.3 }, // Singapore
                        { lat: 25.2048, lng: 55.2708, size: 0.3 }, // Dubai
                        { lat: 52.52, lng: 13.405, size: 0.3 }, // Berlin
                        { lat: 19.4326, lng: -99.1332, size: 0.3 }, // Mexico City
                        { lat: -26.2041, lng: 28.0473, size: 0.3 }, // Johannesburg
                      ]} />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}