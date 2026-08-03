"use client"

import { cn } from "../lib/utils"
import { AnimatedList } from "./ui/animated-list"

interface Item {
  name: string
  description: string
  icon: React.ReactNode
  color: string
  time: string
}

const iconProps = {
  className: "w-5 h-5",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
}

let notifications: Item[] = [
  {
    name: "Limit Order Placed",
    description: "Buy ETH @ $3,800",
    time: "just now",
    icon: <svg {...iconProps}><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>,
    color: "#FFB800",
  },
  {
    name: "Price Hit",
    description: "ETH reached $3,800",
    time: "2s ago",
    icon: <svg {...iconProps}><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" /></svg>,
    color: "#F06718",
  },
  {
    name: "Auto-Repay Triggered",
    description: "Loan: $1,200 → $0",
    time: "3s ago",
    icon: <svg {...iconProps}><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M3 21v-5h5" /></svg>,
    color: "#F06718",
  },
  {
    name: "Loan Repaid",
    description: "Debt cleared automatically",
    time: "5s ago",
    icon: <svg {...iconProps}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="m9 11 3 3L22 4" /></svg>,
    color: "#00C9A7",
  },
]

notifications = Array.from({ length: 10 }, () => notifications).flat()

const Notification = ({ name, description, icon, color, time }: Item) => {
  return (
    <figure
      className={cn(
        "relative mx-auto min-h-fit w-full max-w-[400px] cursor-pointer overflow-hidden rounded-2xl p-4",
        "transition-all duration-200 ease-in-out hover:scale-[103%]",
        "transform-gpu bg-transparent [box-shadow:0_-20px_80px_-20px_#ffffff1f_inset] backdrop-blur-md [border:1px_solid_rgba(255,255,255,.1)]"
      )}
    >
      <div className="flex flex-row items-center gap-3">
        <div
          className="flex size-10 items-center justify-center rounded-2xl text-white"
          style={{ backgroundColor: color }}
        >
          {icon}
        </div>
        <div className="flex flex-col overflow-hidden">
          <figcaption className="flex flex-row items-center text-sm font-medium whitespace-pre text-white">
            <span>{name}</span>
            <span className="mx-1 text-white/30">·</span>
            <span className="text-xs text-white/40">{time}</span>
          </figcaption>
          <p className="text-xs text-white/40">{description}</p>
        </div>
      </div>
    </figure>
  )
}

export default function RepayCards() {
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
      <AnimatedList
        className="absolute right-2 top-4 h-[300px] w-full scale-[0.85] [mask-image:linear-gradient(to_top,transparent_10%,#000_100%)]"
        delay={1500}
      >
        {notifications.map((item, idx) => (
          <Notification {...item} key={idx} />
        ))}
      </AnimatedList>
    </div>
  )
}
