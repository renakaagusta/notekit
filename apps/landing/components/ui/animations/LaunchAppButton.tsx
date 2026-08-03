'use client'

import Link from 'next/link'

export function LaunchAppButton({
  text = 'Open App',
  href = 'https://app.notekit.online',
}: {
  text?: string
  href?: string
}) {
  return (
    <Link href={href} target="_blank" rel="noopener noreferrer">
      <button className="group relative cursor-pointer" aria-label={text}>
        <svg
          className="transition-all duration-300 group-hover:scale-105"
          width="160"
          height="48"
          viewBox="0 0 160 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M8 0 L152 0 L160 48 L0 48 Z"
            fill="#ea7317"
            className="transition-all duration-300 group-hover:fill-[#d4660f]"
          />
          <path
            d="M10 2 L150 2 L158 46 L2 46 Z"
            fill="none"
            stroke="rgba(255,255,255,0.2)"
            strokeWidth="1"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-white font-semibold text-sm tracking-wide">
          {text}
        </span>
      </button>
    </Link>
  )
}
