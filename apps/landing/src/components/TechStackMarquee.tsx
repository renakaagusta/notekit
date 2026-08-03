"use client"

// @ts-ignore - ESM/CJS interop
import MarqueeImport from "react-fast-marquee"
const Marquee = (MarqueeImport as any).default || MarqueeImport
import { cn } from "../lib/utils"

const standards = [
  {
    name: "ProseMirror",
    description: "Rich text editor powering the NoteKit writing experience",
    link: "https://prosemirror.net",
    icon: "https://avatars.githubusercontent.com/u/12474790?s=48",
  },
  {
    name: "age",
    description: "Modern file encryption — X25519 device keys, zero-knowledge",
    link: "https://age-encryption.org",
    icon: "https://avatars.githubusercontent.com/u/57951234?s=48",
  },
  {
    name: "Git",
    description: "Every note is a file, every save is a commit with full history",
    link: "https://git-scm.com",
    icon: "https://git-scm.com/images/logos/downloads/Git-Icon-1788C.png",
  },
  {
    name: "Forgejo",
    description: "Self-hostable Git forge powering managed NoteKit sync",
    link: "https://forgejo.org",
    icon: "https://avatars.githubusercontent.com/u/129726110?s=48",
  },
  {
    name: "GitHub",
    description: "BYO sync — connect your own GitHub repo as a vault",
    link: "https://github.com",
    icon: "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png",
  },
  {
    name: "GitLab",
    description: "BYO sync — connect your own GitLab repo as a vault",
    link: "https://gitlab.com",
    icon: "https://about.gitlab.com/images/press/logo/png/gitlab-icon-rgb.png",
  },
  {
    name: "Electron",
    description: "Native desktop app for macOS, Windows, and Linux",
    link: "https://www.electronjs.org",
    icon: "https://www.electronjs.org/images/electron-logo.svg",
  },
  {
    name: "Capacitor",
    description: "iOS and Android mobile app — same vault, every device",
    link: "https://capacitorjs.com",
    icon: "https://capacitorjs.com/assets/img/capacitor-logo.svg",
  },
  {
    name: "MCP",
    description: "Model Context Protocol — grant agents least-privilege note access",
    link: "https://modelcontextprotocol.io",
    icon: "https://avatars.githubusercontent.com/u/182288589?s=48",
  },
  {
    name: "BIP39",
    description: "24-word recovery phrase re-derives your master key offline",
    link: "https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki",
    icon: "https://avatars.githubusercontent.com/u/5170503?s=48",
  },
]

function LogoCard({ name, description, link, icon }: typeof standards[number]) {
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
        className="w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center border border-white/10 transition-all duration-300 group-hover:border-primary/30 group-hover:bg-primary/10 p-2.5"
        style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
      >
        <img src={icon} alt={name} className="w-full h-full object-contain opacity-60 group-hover:opacity-100 transition-opacity duration-300" />
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
