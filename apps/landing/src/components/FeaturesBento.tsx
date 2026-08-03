import { GlowingEffect } from "./ui/glowing-effect";
import { OrbitingCircles } from "./ui/orbiting-circles";
import { cn } from "../lib/utils";
import { motion } from "framer-motion";

function EditorVisual() {
  const lines = [
    { text: "# Project Roadmap", style: "text-white font-bold" },
    { text: "## Q3 Goals", style: "text-[#ea7317] font-semibold" },
    { text: "- [ ] Ship E2EE sharing", style: "text-neutral-300" },
    { text: "- [x] MCP server", style: "text-neutral-400 line-through" },
    { text: "", style: "" },
    { text: "**Deadline**: Aug 15", style: "text-neutral-300" },
  ];
  return (
    <div className="relative flex h-full w-full items-start justify-start overflow-hidden p-5" style={{ minHeight: 260 }}>
      <div className="flex flex-col gap-1 w-full font-mono text-[11px] leading-5 relative z-10">
        {lines.map((line, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -10 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.3, delay: 0.2 + i * 0.08 }}
            className={line.style || "text-transparent"}
          >
            {line.text || " "}
          </motion.div>
        ))}
        {/* Blinking cursor */}
        <motion.div
          animate={{ opacity: [1, 0, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
          className="w-2 h-4 bg-[#ea7317] rounded-sm mt-0.5"
        />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 via-transparent to-transparent" />
    </div>
  );
}

function EncryptionVisual() {
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden" style={{ minHeight: 260 }}>
      {/* Center key icon */}
      <div
        className="absolute z-10 w-[80px] h-[80px] rounded-full border border-white/[0.08] flex items-center justify-center"
        style={{ background: "linear-gradient(189deg, #252525 5.97%, #0E0E0E 92.92%)" }}
      >
        <svg className="w-8 h-8 text-[#ea7317]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
        </svg>
      </div>
      {/* Inner orbit: device labels */}
      <OrbitingCircles radius={90} duration={20} speed={1} iconSize={44}>
        <div className="flex h-full w-full items-center justify-center rounded-full border border-white/10 bg-neutral-900">
          <span className="text-[8px] font-bold text-white tracking-tight">X25519</span>
        </div>
        <div className="flex h-full w-full items-center justify-center rounded-full border border-white/10 bg-neutral-900">
          <span className="text-[8px] font-bold text-[#ea7317] tracking-tight">age</span>
        </div>
      </OrbitingCircles>
      {/* Outer orbit: device platforms */}
      <OrbitingCircles radius={140} duration={28} speed={1} reverse iconSize={44}>
        <div className="flex h-full w-full items-center justify-center rounded-full border border-white/10 bg-neutral-900">
          <span className="text-[8px] text-white">iOS</span>
        </div>
        <div className="flex h-full w-full items-center justify-center rounded-full border border-white/10 bg-neutral-900">
          <span className="text-[8px] text-white">Desktop</span>
        </div>
        <div className="flex h-full w-full items-center justify-center rounded-full border border-white/10 bg-neutral-900">
          <span className="text-[8px] text-white">Android</span>
        </div>
      </OrbitingCircles>
    </div>
  );
}

function GitVisual() {
  const commits = [
    { hash: "a3f92c1", msg: "update roadmap Q3", time: "just now", author: "you" },
    { hash: "7b14e8d", msg: "add meeting notes", time: "2h ago", author: "you" },
    { hash: "c9012fa", msg: "initial vault commit", time: "3d ago", author: "you" },
  ];
  return (
    <div className="flex flex-1 w-full h-full min-h-[6rem] items-start justify-start p-4 overflow-hidden">
      <div className="flex flex-col gap-2 w-full">
        {commits.map((c, i) => (
          <motion.div
            key={i}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06]"
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.2 + i * 0.12 }}
          >
            <span className="text-[10px] text-[#ea7317] font-mono w-12 flex-shrink-0">{c.hash}</span>
            <span className="text-[10px] text-neutral-300 font-mono flex-1 truncate">{c.msg}</span>
            <span className="text-[10px] text-neutral-500">{c.time}</span>
          </motion.div>
        ))}
        <div className="flex items-center gap-2 mt-1 px-1">
          <svg className="w-3 h-3 text-neutral-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/>
            <path d="M18 9v1a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9"/>
            <path d="M12 12v3"/>
          </svg>
          <span className="text-[10px] text-neutral-600 font-mono">on branch main · Forgejo</span>
        </div>
      </div>
    </div>
  );
}

function MCPVisual() {
  return (
    <div className="flex flex-1 w-full h-full min-h-[6rem] items-start justify-start p-4 overflow-hidden">
      <div className="flex flex-col gap-2 w-full">
        {[
          "claude: read_note('roadmap.md')",
          "notekit: → decrypted content",
          "claude: write_note('roadmap.md', ...)",
          "notekit: → committed a3f92c1",
        ].map((line, i) => (
          <motion.div
            key={i}
            className="flex items-center px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06]"
            initial={{ opacity: 0, x: -16 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.35, delay: 0.2 + i * 0.15 }}
          >
            <span className={`text-[10px] font-mono ${i % 2 === 1 ? "text-[#ea7317]" : "text-neutral-300"}`}>{line}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function OfflineVisual() {
  return (
    <div className="flex flex-1 w-full h-full min-h-[6rem] items-center justify-center p-4 overflow-hidden">
      <div className="flex flex-col items-center gap-4 relative z-10">
        <motion.div
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 2.5, repeat: Infinity }}
          className="w-14 h-14 rounded-full flex items-center justify-center border border-white/10"
          style={{ background: "linear-gradient(135deg, #1a1a1a, #0a0a0a)" }}
        >
          <svg className="w-7 h-7 text-neutral-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M20.354 15.354A9 9 0 0 1 8.646 3.646 9.003 9.003 0 0 0 12 21a9.003 9.003 0 0 0 8.354-5.646z"/>
          </svg>
        </motion.div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs text-white font-medium">Offline mode</span>
          <span className="text-[10px] text-neutral-500">12 changes queued</span>
        </div>
        <motion.div
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#ea7317]/30 bg-[#ea7317]/5"
        >
          <div className="w-1.5 h-1.5 rounded-full bg-[#ea7317]" />
          <span className="text-[10px] text-[#ea7317] font-mono">Syncing when online...</span>
        </motion.div>
      </div>
    </div>
  );
}

const features = [
  {
    area: "md:[grid-area:1/1/2/4]",
    title: "Rich Markdown Editor",
    description: (
      <>
        ProseMirror-powered editor with{" "}
        <span className="text-white font-medium">slash commands</span>,{" "}
        <span className="text-white font-medium">tables</span>,{" "}
        <span className="text-white font-medium">math (KaTeX)</span>,{" "}
        <span className="text-white font-medium">diagrams</span>, and{" "}
        <span className="text-white font-medium">code blocks</span> with syntax highlighting. Your notes, your way.
      </>
    ),
    pillar: "Writing",
    header: <EditorVisual />,
  },
  {
    area: "md:[grid-area:1/4/2/6]",
    title: "age Encryption",
    description: (
      <>
        <span className="text-white font-medium">X25519 key pairs</span> per device. Notes are encrypted{" "}
        <span className="text-white font-medium">before they leave your device</span>. The server sees only ciphertext it cannot read.
      </>
    ),
    pillar: "Privacy",
    header: <EncryptionVisual />,
  },
  {
    area: "md:[grid-area:2/1/3/3]",
    title: "Git-Backed History",
    description: (
      <>
        Every note is a file, every save a{" "}
        <span className="text-white font-medium">Git commit</span>. Full history, diff, and rollback on your own{" "}
        <span className="text-white font-medium">Forgejo, GitHub, or GitLab</span>.
      </>
    ),
    pillar: "Portability",
    header: <GitVisual />,
  },
  {
    area: "md:[grid-area:2/3/3/6]",
    title: "MCP Agent Access",
    description: (
      <>
        Drop the{" "}
        <span className="text-white font-medium">MCP server</span> into Claude Code or Cursor.{" "}
        Agents read and write <span className="text-white font-medium">only what you grant</span> — least-privilege by default. Every agent write is a signed commit.
      </>
    ),
    pillar: "Agent-Ready",
    header: <MCPVisual />,
  },
];

export default function FeaturesBento() {
  return (
    <motion.ul
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-50px" }}
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.15 } },
      }}
      className="grid grid-cols-1 grid-rows-none gap-4 md:grid-cols-5 md:grid-rows-2 lg:gap-4 xl:max-w-none xl:grid-rows-2"
    >
      {features.map((feature, i) => (
        <motion.li
          key={i}
          variants={{
            hidden: { opacity: 0, y: 30 },
            visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
          }}
          className={cn(
            "min-h-[28rem] list-none",
            feature.area
          )}
        >
          <div className="relative h-full rounded-2xl border border-white/[0.06] md:rounded-3xl">
            <GlowingEffect
              spread={40}
              glow={true}
              disabled={false}
              proximity={64}
              inactiveZone={0.01}
            />
            <div className="relative flex h-full flex-col overflow-hidden rounded-2xl bg-neutral-900 md:rounded-3xl"
              style={{
                boxShadow: "0px 1px 1px rgba(0,0,0,0.05), 0px 4px 6px rgba(34,42,53,0.04), 0px 24px 68px rgba(47,48,55,0.05), 0px 2px 3px rgba(0,0,0,0.04)"
              }}
            >
              {/* Header visual */}
              <div className="relative h-[260px] overflow-hidden">
                {feature.header}
              </div>

              {/* Content area */}
              <div className="relative z-10 flex flex-col flex-1 p-5 md:p-6">
                {/* Pillar badge */}
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[10px] uppercase tracking-widest text-primary/80 font-medium px-2 py-0.5 rounded-full border border-primary/20 bg-primary/5">
                    {feature.pillar}
                  </span>
                </div>

                {/* Title */}
                <h3 className="text-lg md:text-xl font-medium text-white mb-2" style={{ fontFamily: "'Schibsted Grotesk', sans-serif" }}>
                  {feature.title}
                </h3>

                {/* Description */}
                <p className="text-sm text-neutral-400 tracking-tight leading-relaxed">
                  {feature.description}
                </p>
              </div>
            </div>
          </div>
        </motion.li>
      ))}
    </motion.ul>
  );
}
