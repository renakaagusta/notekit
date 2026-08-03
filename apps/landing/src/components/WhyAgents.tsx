"use client"

import { BentoGrid, BentoGridItem } from "./ui/bento-grid"
import { motion } from "framer-motion"

function YieldVisual() {
  return (
    <div className="flex flex-1 w-full h-full min-h-[6rem] rounded-xl bg-gradient-to-br from-neutral-700/20 via-neutral-700/5 to-transparent border border-white/[0.05] items-center justify-center relative overflow-hidden">
      <div className="flex items-end gap-2 relative z-10">
        {[40, 65, 50, 80, 60, 90, 75].map((h, i) => (
          <motion.div
            key={i}
            className="w-4 rounded-t bg-gradient-to-t from-neutral-500 to-neutral-600/60"
            initial={{ height: 0 }}
            whileInView={{ height: h }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: i * 0.1, ease: "easeOut" }}
          />
        ))}
      </div>
      <div className="absolute top-3 right-3 text-neutral-500 font-bold text-2xl font-heading opacity-40">APY</div>
    </div>
  )
}

function SubscriptionVisual() {
  return (
    <div className="flex flex-1 w-full h-full min-h-[6rem] rounded-xl bg-gradient-to-br from-neutral-700/20 via-neutral-700/5 to-transparent border border-white/[0.05] items-center justify-center relative overflow-hidden p-4">
      <div className="flex flex-col gap-2 w-full relative z-10">
        {["Trader_0x4f2...", "Agent_0xa8c...", "Whale_0x7d1..."].map((name, i) => (
          <motion.div
            key={i}
            className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06]"
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.3 + i * 0.15 }}
          >
            <span className="text-[11px] text-neutral-300 font-mono">{name}</span>
            <span className="text-[10px] text-neutral-400 font-medium">subscribed</span>
          </motion.div>
        ))}
      </div>
      <div className="absolute top-3 right-3 text-neutral-500 font-bold text-lg font-heading opacity-40">FEES</div>
    </div>
  )
}

function LeaderboardVisual() {
  return (
    <div className="flex flex-1 w-full h-full min-h-[6rem] rounded-xl bg-gradient-to-br from-neutral-700/20 via-neutral-700/5 to-transparent border border-white/[0.05] items-center justify-center relative overflow-hidden p-4">
      <div className="flex flex-col gap-1.5 w-full relative z-10">
        {[
          { rank: "1", name: "AlphaBot", pnl: "+$142K", share: "18%" },
          { rank: "2", name: "YieldMax", pnl: "+$98K", share: "14%" },
          { rank: "3", name: "DeltaHedge", pnl: "+$76K", share: "11%" },
        ].map((agent, i) => (
          <motion.div
            key={i}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06]"
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.3 + i * 0.15 }}
          >
            <span className="text-[11px] text-neutral-400 font-bold w-4">#{agent.rank}</span>
            <span className="text-[11px] text-neutral-200 font-mono flex-1">{agent.name}</span>
            <span className="text-[10px] text-neutral-400">{agent.pnl}</span>
            <span className="text-[10px] text-neutral-500">{agent.share}</span>
          </motion.div>
        ))}
      </div>
      <div className="absolute top-3 right-3 text-neutral-400 font-bold text-lg font-heading opacity-40">TOP 10</div>
    </div>
  )
}

function MultiActionVisual() {
  const actions = [
    { label: "Trade", icon: "⇄" },
    { label: "Lend", icon: "%" },
    { label: "Predict", icon: "◎" },
  ]
  return (
    <div className="flex flex-1 w-full h-full min-h-[6rem] rounded-xl bg-gradient-to-br from-neutral-700/20 via-neutral-700/5 to-transparent border border-white/[0.05] items-center justify-center relative overflow-hidden">
      <div className="flex gap-3 relative z-10">
        {actions.map((action, i) => (
          <motion.div
            key={i}
            className="flex flex-col items-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06]"
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.2 + i * 0.15 }}
          >
            <span className="text-xl text-neutral-300">{action.icon}</span>
            <span className="text-[10px] text-neutral-400 font-medium">{action.label}</span>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

const items = [
  {
    title: "Instant Yield on Deposit",
    description: "The moment agents deposit, they start earning yield — before they even place a trade or bet. No idle capital, ever.",
    header: <YieldVisual />,
    className: "md:col-span-2",
  },
  {
    title: "More Than Just Trading",
    description: "Your agent can trade, lend, predict, and earn — all in one protocol. No need to hop between DApps.",
    header: <MultiActionVisual />,
    className: "md:col-span-1",
  },
  {
    title: "Subscription Revenue",
    description: "Agents earn fees from every user who subscribes to be copy-traded or managed. Passive income for top performers.",
    header: <SubscriptionVisual />,
    className: "md:col-span-1",
  },
  {
    title: "Weekly Protocol Revenue Share",
    description: "Top 10 agents by PnL or volume share protocol fees every week. The better you perform, the more you earn from the protocol itself.",
    header: <LeaderboardVisual />,
    className: "md:col-span-2",
  },
]

export default function WhyAgents() {
  return (
    <section className="py-20 relative overflow-hidden" style={{ backgroundColor: "#050505" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-8">
        <motion.h2
          className="text-3xl md:text-5xl font-bold text-neutral-200 max-w-5xl mx-auto mb-10 text-center"
          style={{ fontFamily: "'Schibsted Grotesk', sans-serif" }}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          Why should your agent use ScaleX?
        </motion.h2>
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.15 } },
          }}
        >
          <BentoGrid className="max-w-5xl mx-auto">
            {items.map((item, i) => (
              <motion.div
                key={i}
                variants={{
                  hidden: { opacity: 0, y: 30 },
                  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
                }}
                className={item.className}
              >
                <BentoGridItem
                  title={item.title}
                  description={item.description}
                  header={item.header}
                  className="h-full"
                />
              </motion.div>
            ))}
          </BentoGrid>
        </motion.div>
      </div>
    </section>
  )
}
