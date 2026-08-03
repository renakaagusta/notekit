"use client"

import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import LaunchAppButton from '../ui/animations/LaunchAppButton'

export function CTA() {
    const sectionRef = useRef<HTMLDivElement>(null)
    const titleRef = useRef<HTMLHeadingElement>(null)
    const descriptionRef = useRef<HTMLParagraphElement>(null)
    const buttonRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        gsap.registerPlugin(ScrollTrigger)

        if (sectionRef.current && titleRef.current && descriptionRef.current && buttonRef.current) {
            const title = titleRef.current
            const description = descriptionRef.current
            const button = buttonRef.current

            // Set initial states
            gsap.set(title, { y: 50, opacity: 0 })
            gsap.set(description, { y: 30, opacity: 0 })
            gsap.set(button, { y: 20, opacity: 0, scale: 0.9 })

            // Create timeline
            const tl = gsap.timeline({
                scrollTrigger: {
                    trigger: sectionRef.current,
                    start: "top 80%",
                    end: "bottom 20%",
                    toggleActions: "play none none reverse"
                }
            })

            // Animate elements
            tl.to(title, {
                y: 0,
                opacity: 1,
                duration: 1.2,
                ease: "power2.out"
            })
                .to(description, {
                    y: 0,
                    opacity: 1,
                    duration: 0.8,
                    ease: "power2.out"
                }, "-=0.8")
                .to(button, {
                    y: 0,
                    opacity: 1,
                    scale: 1,
                    duration: 0.6,
                    ease: "back.out(1.7)"
                }, "-=0.4")
        }

        return () => {
            ScrollTrigger.getAll().forEach(trigger => trigger.kill())
        }
    }, [])

    return (
        <section ref={sectionRef} className="pt-18 pb-36">
            <div className="px-6 sm:px-8 lg:px-16">
                <div className="max-w-4xl mx-auto text-center">
                    <h2 ref={titleRef} className="text-4xl lg:text-6xl font-bold text-white mb-6 leading-tight">
                        Experience the DeFi Flywheel
                    </h2>
                    <p ref={descriptionRef} className="text-xl text-gray-400 leading-relaxed mb-12 max-w-2xl mx-auto">
                        Start earning yield while you trade. Join the revolution of capital efficiency with Order Book DEX integrated with Lending Protocol.
                    </p>
                    <div ref={buttonRef} className="flex justify-center">
                        <div className="transform scale-75 sm:scale-90 md:scale-100">
                            <LaunchAppButton
                                text="Get Started Now"
                                href={process.env.NEXT_PUBLIC_APP_URL}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}