'use client';

import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

interface FeatureProps {
  label?: string
  currentStep?: number
  totalSteps?: number
  title?: string
  description: string
  backgroundImage?: string
}

const featureContents = [
  {
    step: 1,
    title: 'Ultimate Capital Efficiency',
    description: 'Maximize returns by keeping your entire portfolio productive with our revolutionary approach to capital deployment. Never let your assets sit idle again while maintaining full liquidity and trading flexibility across multiple protocols and markets.',
  },
  {
    step: 2,
    title: 'Order Book Liquidation Protection',
    description: 'Trade safely with our advanced built-in protection mechanisms that shield you from unfavorable liquidations. Our intelligent monitoring system continuously tracks market conditions and automatically adjusts positions to prevent forced liquidations during volatile periods.',
  },
  {
    step: 3,
    title: 'Smart Loan Repayment System',
    description: 'Benefit from automated strategies that intelligently optimize your debt management and maximize returns through dynamic rebalancing. Our sophisticated algorithms continuously analyze market opportunities and automatically execute optimal repayment schedules based on yield differentials.',
  },
];

export default function Feature({
  label,
  currentStep = 1,
  totalSteps = 3,
  title,
  description,
  backgroundImage,
}: FeatureProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const descriptionRef = useRef<HTMLParagraphElement>(null);
  const [activeContent, setActiveContent] = useState(0);
  const previousContentRef = useRef(0);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    const section = sectionRef.current;
    const progressBar = progressRef.current;
    const content = contentRef.current;
    const title = titleRef.current;
    const description = descriptionRef.current;
    if (!section || !progressBar || !content || !title || !description) return;

    gsap.set(progressBar, { scaleX: 0, transformOrigin: 'left center' });
    gsap.set(content, { opacity: 1, y: 0 }); // Make first content visible

    const splitTextIntoLetters = (element: HTMLElement) => {
      const text = element.textContent || '';
      const words = text.split(' ');

      element.innerHTML = words.map(word => {
        const letters = word.split('').map(letter =>
          `<span style="opacity: 0.6; color: white; display: inline-block;">${letter}</span>`
        ).join('');
        return `<span style="display: inline-block; white-space: nowrap;">${letters}</span>`;
      }).join(' ');

      return element.querySelectorAll('span span');
    };

    const titleLetters = splitTextIntoLetters(title);
    const descriptionLetters = splitTextIntoLetters(description);
    const allLetters = [...titleLetters, ...descriptionLetters];

    const letterRevealAnimation = gsap.to(allLetters, {
      opacity: 1,
      duration: 1,
      stagger: {
        each: 0.02,
        from: 'start'
      },
      ease: 'power2.out',
      scrollTrigger: {
        trigger: section,
        start: 'top top',
        end: '+=800vh',
        scrub: 1,
      }
    });

    const scrollTrigger = gsap.to(progressBar, {
      scaleX: 1,
      ease: 'none',
      scrollTrigger: {
        trigger: section,
        start: 'top top',
        end: '+=800vh',
        scrub: 1,
        pin: true,
        pinSpacing: true,
        onUpdate: (self) => {
          const progress = self.progress;
          let newContentIndex = 0;

          if (progress > 0.66) {
            newContentIndex = 2;
          } else if (progress > 0.33) {
            newContentIndex = 1;
          } else {
            newContentIndex = 0;
          }

          const wordContainers = content.querySelectorAll('span[style*="white-space: nowrap"]');
          const currentLetters = content.querySelectorAll('span span');

          if (wordContainers.length > 0 && currentLetters.length > 0) {
            const stepProgress = ((progress * 3) % 1);
            const totalWords = wordContainers.length;
            const wordsToReveal = Math.floor(stepProgress * totalWords);

            const wordProgress = (stepProgress * totalWords) % 1;

            let letterIndex = 0;
            wordContainers.forEach((wordContainer, wordIndex) => {
              const lettersInWord = wordContainer.querySelectorAll('span');

              if (wordIndex < wordsToReveal) {
                lettersInWord.forEach(letter => {
                  gsap.set(letter, { opacity: 1 });
                });
              } else if (wordIndex === wordsToReveal) {
                const lettersToShowInCurrentWord = Math.floor(wordProgress * lettersInWord.length);
                lettersInWord.forEach((letter, letterIndexInWord) => {
                  if (letterIndexInWord <= lettersToShowInCurrentWord) {
                    gsap.set(letter, { opacity: 1 });
                  } else {
                    gsap.set(letter, { opacity: 0.6 });
                  }
                });
              } else {
                lettersInWord.forEach(letter => {
                  gsap.set(letter, { opacity: 0.6 });
                });
              }

              letterIndex += lettersInWord.length;
            });
          }

          if (newContentIndex !== previousContentRef.current) {
            const content = contentRef.current;
            if (content) {
              previousContentRef.current = newContentIndex;

              gsap.to(content, {
                opacity: 0,
                y: -20,
                duration: 0.3,
                ease: 'power2.out',
                onComplete: () => {
                  setActiveContent(newContentIndex);

                  setTimeout(() => {
                    splitTextIntoLetters(title);
                    splitTextIntoLetters(description);

                    const stepProgress = ((progress * 3) % 1);
                    const wordContainers = content.querySelectorAll('span[style*="white-space: nowrap"]');
                    const totalWords = wordContainers.length;
                    const wordsToReveal = Math.floor(stepProgress * totalWords);
                    const wordProgress = (stepProgress * totalWords) % 1;

                    const allLetters = content.querySelectorAll('span span');
                    gsap.set(allLetters, { opacity: 0.6 });

                    wordContainers.forEach((wordContainer, wordIndex) => {
                      const lettersInWord = wordContainer.querySelectorAll('span');

                      if (wordIndex < wordsToReveal) {
                        gsap.set(lettersInWord, { opacity: 1 });
                      } else if (wordIndex === wordsToReveal) {
                        const lettersToShowInCurrentWord = Math.floor(wordProgress * lettersInWord.length);
                        gsap.set(Array.from(lettersInWord).slice(0, lettersToShowInCurrentWord + 1), { opacity: 1 });
                      }
                    });
                  }, 50);

                  gsap.fromTo(content,
                    { opacity: 0, y: 20 },
                    { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' }
                  );
                }
              });
            }
          }
        }
      }
    });

    return () => {
      scrollTrigger.scrollTrigger?.kill();
      scrollTrigger.kill();
      letterRevealAnimation.scrollTrigger?.kill();
      letterRevealAnimation.kill();
    };
  }, []);

  const currentContent = featureContents[activeContent];

  return (
    <section ref={sectionRef} className="relative min-h-screen overflow-hidden">
      {/* Background image overlay */}
      {backgroundImage && (
        <div
          className="absolute inset-0 opacity-40 bg-cover bg-center"
          style={{ backgroundImage: `url(${backgroundImage})` }}
        />
      )}

      {/* Content wrapper */}
      <div className="absolute top-1/6 sm:top-1/5 z-10 w-full">
        {/* Header */}
        <div className="px-4 sm:px-6 md:px-8 py-4 sm:py-6 mx-4 sm:mx-6 md:mx-10 mb-4">
          <div className="flex items-center gap-2 bg-white/20 w-fit px-3 py-2 rounded-lg">
            <div className="w-4 sm:w-5 h-4 sm:h-5 bg-orange-600 rounded-lg" />
            <span className="text-xs sm:text-sm font-semibold text-white tracking-widest uppercase">{label}</span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full h-px bg-white/20 relative">
          <div
            ref={progressRef}
            className="absolute left-0 top-0 h-full bg-white w-full origin-left"
            style={{ transform: 'scaleX(0)' }}
          />
        </div>

        {/* Main content */}
        <div className="flex flex-col sm:flex-row items-start mt-6 sm:mt-8 mx-4 sm:mx-6 md:mx-10">
          {/* Left side - Step counter */}
          <div className="w-full sm:w-1/3 flex items-start px-4 sm:px-6 md:px-8 mb-6 sm:mb-0">
            <div className="border border-white/20 rounded-full px-4 sm:px-6 py-2 sm:py-3 bg-white/5 backdrop-blur-sm">
              <span className="text-white text-xs sm:text-sm font-light tracking-widest">
                {String(currentContent.step).padStart(2, "0")} / {String(totalSteps).padStart(2, "0")}
              </span>
            </div>
          </div>

          {/* Right side - Content */}
          <div ref={contentRef} className="w-full sm:w-2/3 px-4 sm:px-6 md:px-8 pr-4 sm:pr-8 md:pr-16">
            <h2 ref={titleRef} className="text-2xl sm:text-3xl md:text-4xl lg:text-6xl font-bold text-white mb-4 sm:mb-6 leading-tight">
              {currentContent.title}
            </h2>
            <p ref={descriptionRef} className="text-base sm:text-lg md:text-xl lg:text-2xl xl:text-3xl text-white leading-relaxed text-balance">
              {currentContent.description}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}