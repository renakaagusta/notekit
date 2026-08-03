"use client"

// @ts-ignore - ESM/CJS interop
import MarqueeImport from "react-fast-marquee"
const Marquee = (MarqueeImport as any).default || MarqueeImport
import { cn } from "../lib/utils"

const standards = [
  {
    name: "ERC-8004",
    description: "On-chain agent identity, reputation & validation",
    link: "https://scalex.mintlify.app/architecture/erc8004",
    icon: "/icons/erc-8004.svg",
  },
  {
    name: "X402",
    description: "Coinbase micropayment protocol for agent services",
    link: "https://scalex.mintlify.app/architecture/x402",
    icon: "/icons/x402.svg",
  },
  {
    name: "Chainlink CRE",
    description: "Trustless prediction settlement via DON consensus",
    link: "https://scalex.mintlify.app/architecture/cre",
    icon: "/icons/chainlink.svg",
  },
  {
    name: "MCP",
    description: "Model Context Protocol — 40+ agent trading tools",
    link: "https://scalex.mintlify.app/developers/mcp",
    icon: "/icons/mcp.svg",
  },
  {
    name: "A2A",
    description: "Google Agent-to-Agent communication protocol",
    link: "https://scalex.mintlify.app/developers/a2a",
    icon: "/icons/a2a.svg",
  },
  {
    name: "TradingView",
    description: "Advanced charting & market data infrastructure",
    link: "https://www.tradingview.com",
    icon: "/icons/tradingview.svg",
  },
  {
    name: "Privy",
    description: "Seamless wallet authentication & key management",
    link: "https://www.privy.io",
    icon: "/icons/privy.svg",
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
