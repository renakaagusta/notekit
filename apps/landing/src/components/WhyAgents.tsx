"use client"

import { BentoGrid, BentoGridItem } from "./ui/bento-grid"
import { motion } from "framer-motion"

function MCPVisual() {
  return (
    <div className="flex flex-1 w-full h-full min-h-[6rem] rounded-xl bg-gradient-to-br from-neutral-700/20 via-neutral-700/5 to-transparent border border-white/[0.05] items-center justify-center relative overflow-hidden p-4">
      <div className="flex flex-col gap-2 w-full relative z-10">
        {["claude: read_note('roadmap.md')", "notekit: → decrypted content", "claude: write_note('roadmap.md', ...)"].map((line, i) => (
          <motion.div
            key={i}
            className="flex items-center px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06]"
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.3 + i * 0.2 }}
          >
            <span className={`text-[10px] font-mono ${i === 1 ? "text-white" : "text-neutral-300"}`}>{line}</span>
          </motion.div>
        ))}
      </div>
      <div className="absolute top-3 right-3 text-neutral-500 font-bold text-lg font-heading opacity-40">MCP</div>
    </div>
  )
}

function GrantVisual() {
  return (
    <div className="flex flex-1 w-full h-full min-h-[6rem] rounded-xl bg-gradient-to-br from-neutral-700/20 via-neutral-700/5 to-transparent border border-white/[0.05] items-center justify-center relative overflow-hidden p-4">
      <div className="flex flex-col gap-1.5 w-full relative z-10">
        {[
          { note: "roadmap.md", access: "agent:claude ✓" },
          { note: "journal/", access: "🔒 encrypted" },
          { note: "secrets.md", access: "🔒 encrypted" },
        ].map((row, i) => (
          <motion.div
            key={i}
            className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06]"
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.3 + i * 0.15 }}
          >
            <span className="text-[11px] text-neutral-200 font-mono">{row.note}</span>
            <span className={`text-[10px] ${i === 0 ? "text-white" : "text-neutral-500"}`}>{row.access}</span>
          </motion.div>
        ))}
      </div>
      <div className="absolute top-3 right-3 text-neutral-500 font-bold text-lg font-heading opacity-40">ACL</div>
    </div>
  )
}

function GitAuditVisual() {
  return (
    <div className="flex flex-1 w-full h-full min-h-[6rem] rounded-xl bg-gradient-to-br from-neutral-700/20 via-neutral-700/5 to-transparent border border-white/[0.05] items-center justify-center relative overflow-hidden p-4">
      <div className="flex flex-col gap-1.5 w-full relative z-10">
        {[
          { hash: "a3f92c1", msg: "agent:claude: update roadmap Q3", time: "2m ago" },
          { hash: "7b14e8d", msg: "you: add project notes", time: "1h ago" },
          { hash: "c9012fa", msg: "you: initial vault commit", time: "2d ago" },
        ].map((commit, i) => (
          <motion.div
            key={i}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06]"
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.3 + i * 0.15 }}
          >
            <span className="text-[10px] text-white font-mono w-12 flex-shrink-0">{commit.hash}</span>
            <span className="text-[10px] text-neutral-300 font-mono flex-1 truncate">{commit.msg}</span>
            <span className="text-[10px] text-neutral-500">{commit.time}</span>
          </motion.div>
        ))}
      </div>
      <div className="absolute top-3 right-3 text-neutral-500 font-bold text-lg font-heading opacity-40">LOG</div>
    </div>
  )
}

function E2EEVisual() {
  const steps = [
    { label: "Write", icon: "✍" },
    { label: "Encrypt", icon: "🔐" },
    { label: "Sync", icon: "↑ Git" },
  ]
  return (
    <div className="flex flex-1 w-full h-full min-h-[6rem] rounded-xl bg-gradient-to-br from-neutral-700/20 via-neutral-700/5 to-transparent border border-white/[0.05] items-center justify-center relative overflow-hidden">
      <div className="flex gap-3 relative z-10">
        {steps.map((step, i) => (
          <motion.div
            key={i}
            className="flex flex-col items-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06]"
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.2 + i * 0.15 }}
          >
            <span className="text-xl">{step.icon}</span>
            <span className="text-[10px] text-neutral-400 font-medium">{step.label}</span>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

const items = [
  {
    title: "MCP — Drop-in AI Context",
    description: "NoteKit ships an MCP server. Drop it into Claude Code, Cursor, or any MCP host. Your granted notes become live context for your AI assistant.",
    header: <MCPVisual />,
    className: "md:col-span-2",
  },
  {
    title: "Least-Privilege Grants",
    description: "Grant an agent access to one folder or one note. Your other vaults stay encrypted and invisible to it. Revoke any time.",
    header: <GrantVisual />,
    className: "md:col-span-1",
  },
  {
    title: "Git Audit Trail",
    description: "Every agent write is a signed Git commit. See exactly what the agent changed, when, and roll it back with one command.",
    header: <GitAuditVisual />,
    className: "md:col-span-1",
  },
  {
    title: "E2EE Agent Keys",
    description: "Agents get their own age key pair — they decrypt only what was encrypted to them. The master phrase never leaves your device.",
    header: <E2EEVisual />,
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
          Why agents need NoteKit
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
