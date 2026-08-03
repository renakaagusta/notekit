"use client"

import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { Marquee } from "@/components/ui/marquee"

const integrations = [
    {
        icon: '/images/partners/espresso.png',
        name: 'Espresso Network',
        description: 'Cross-chain composability confirmation layer',
    },
    {
        icon: '/images/partners/based.webp',
        name: 'Base',
        description: 'Open onchain platform built by Coinbase',
    },
    {
        icon: '/images/partners/hyperlane.png',
        name: 'Hyperlane',
        description: 'Cross-chain composability network',
    },
    {
        icon: '/images/partners/privy.jpg',
        name: 'Privy',
        description: 'Secure wallet and private key management',
    },
    {
        icon: '/images/partners/ponder.png',
        name: 'Ponder',
        description: 'Fast, reliable crypto backend software',
    },
    {
        icon: '/images/partners/tradingview.png',
        name: 'TradingView',
        description: 'Powerful charting and trading tools',
    },
]

export function IntegrationsMarquee() {
    const sectionRef = useRef<HTMLDivElement>(null)
    const titleRef = useRef<HTMLHeadingElement>(null)
    const marqueeRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        gsap.registerPlugin(ScrollTrigger)

        if (sectionRef.current && titleRef.current && marqueeRef.current) {
            const title = titleRef.current
            const marqueeContainer = marqueeRef.current
            const cards = marqueeContainer.querySelectorAll('[data-card]')

            // Set initial states
            gsap.set(title, { y: 50, opacity: 0 })
            gsap.set(cards, { y: 30, opacity: 0 })

            // Create timeline
            const tl = gsap.timeline({
                scrollTrigger: {
                    trigger: sectionRef.current,
                    start: "top 80%",
                    end: "bottom 20%",
                    toggleActions: "play none none reverse"
                }
            })

            // Title animation
            tl.to(title, {
                y: 0,
                opacity: 1,
                duration: 1,
                ease: "power2.out"
            })

                // Cards staggered animation
                .to(cards, {
                    y: 0,
                    opacity: 1,
                    duration: 0.8,
                    stagger: 0.1,
                    ease: "power2.out"
                }, "-=0.5")
        }

        return () => {
            ScrollTrigger.getAll().forEach(trigger => trigger.kill())
        }
    }, [])

    return (
        <div ref={sectionRef} className="py-24 bg-[#1e1c1c]">
            <div ref={marqueeRef}>
                <Marquee pauseOnHover className="[--duration:60s]">
                    {integrations.map((integration, index) => (
                        <div
                            key={index}
                            data-card
                            className="mx-4 rounded-2xl border border-white/10 p-6 backdrop-blur-sm transition-all hover:scale-105 w-96 shrink-0 bg-linear-to-br from-white/5 via-white/5 to-orange-500/10 hover:border-white/20"
                        >
                            <div className="flex items-start gap-4">
                                <div className="w-8 h-8">
                                    <img
                                        src={integration.icon}
                                        alt={integration.name}
                                        className="w-full h-full object-contain"
                                    />
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-xl font-semibold text-white mb-2">
                                        {integration.name}
                                    </h3>
                                    <p className="text-gray-400 text-sm leading-relaxed">
                                        {integration.description}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))}
                </Marquee>
            </div>
        </div>
    )
}