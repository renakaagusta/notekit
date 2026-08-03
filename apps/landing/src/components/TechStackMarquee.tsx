"use client"

// @ts-ignore - ESM/CJS interop
import MarqueeImport from "react-fast-marquee"
const Marquee = (MarqueeImport as any).default || MarqueeImport
import { cn } from "../lib/utils"

const standards = [
  {
    name: "ProseMirror",
    abbr: "PM",
    color: "#6e40c9",
    description: "Rich text editor powering the NoteKit writing experience",
    link: "https://prosemirror.net",
  },
  {
    name: "age",
    abbr: "age",
    color: "#ea7317",
    description: "Modern file encryption — X25519 device keys, zero-knowledge",
    link: "https://age-encryption.org",
  },
  {
    name: "Git",
    abbr: "Git",
    color: "#f05032",
    description: "Every note is a file, every save is a commit with full history",
    link: "https://git-scm.com",
  },
  {
    name: "Forgejo",
    abbr: "FJ",
    color: "#578a2e",
    description: "Self-hostable Git forge powering managed NoteKit sync",
    link: "https://forgejo.org",
  },
  {
    name: "GitHub",
    abbr: "GH",
    color: "#e0e0e0",
    description: "BYO sync — connect your own GitHub repo as a vault",
    link: "https://github.com",
  },
  {
    name: "GitLab",
    abbr: "GL",
    color: "#fc6d26",
    description: "BYO sync — connect your own GitLab repo as a vault",
    link: "https://gitlab.com",
  },
  {
    name: "Electron",
    abbr: "El",
    color: "#47848f",
    description: "Native desktop app for macOS, Windows, and Linux",
    link: "https://www.electronjs.org",
  },
  {
    name: "Capacitor",
    abbr: "Cap",
    color: "#53b9ff",
    description: "iOS and Android mobile app — same vault, every device",
    link: "https://capacitorjs.com",
  },
  {
    name: "MCP",
    abbr: "MCP",
    color: "#ea7317",
    description: "Model Context Protocol — grant agents least-privilege note access",
    link: "https://modelcontextprotocol.io",
  },
  {
    name: "BIP39",
    abbr: "B39",
    color: "#f7931a",
    description: "24-word recovery phrase re-derives your master key offline",
    link: "https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki",
  },
  {
    name: "TypeScript",
    abbr: "TS",
    color: "#3178c6",
    description: "Type-safe codebase across all NoteKit clients",
    link: "https://www.typescriptlang.org",
  },
]

function LogoCard({ name, abbr, color, description, link }: typeof standards[number]) {
  return (
    <a
      href={link}
      target="_blank"
      rel="noopener"
      className={cn(
        "group flex items-center gap-4 px-6 py-4 rounded-2xl border border-white/[0.08] transition-all duration-300 hover:border-primary/30 hover:bg-white/[0.03]",
        "min-w-[280px] mx-3"
      )}
      style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)" }}
    >
      <div
        className="w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center border border-white/10 transition-all duration-300 group-hover:border-primary/30"
        style={{ backgroundColor: `${color}22` }}
      >
        <span
          className="text-[11px] font-bold leading-none tracking-tight"
          style={{ color }}
        >
          {abbr}
        </span>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-white text-base font-medium leading-5" style={{ fontFamily: "'Schibsted Grotesk', sans-serif" }}>
          {name}
        </span>
        <span className="text-white/50 text-xs leading-4">
          {description}
        </span>
      </div>
    </a>
  )
}

export default function TechStackMarquee() {
  return (
    <div className="relative flex flex-col gap-4">
      <Marquee
        pauseOnHover
        speed={40}
        gradient
        gradientColor="#050505"
        gradientWidth={150}
      >
        {standards.map((s) => (
          <LogoCard key={s.name} {...s} />
        ))}
      </Marquee>
      <Marquee
        pauseOnHover
        direction="right"
        speed={30}
        gradient
        gradientColor="#050505"
        gradientWidth={150}
      >
        {standards.map((s) => (
          <LogoCard key={s.name} {...s} />
        ))}
      </Marquee>
    </div>
  )
}
