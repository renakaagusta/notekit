import { GlowingEffect } from "./ui/glowing-effect";
import RepayCards from "./RepayCards";
import { OrbitingCircles } from "./ui/orbiting-circles";
import { ThreeDMarquee } from "./ui/3d-marquee";
import TradeBeamHeader from "./TradeBeamHeader";
import { cn } from "../lib/utils";
import { motion } from "framer-motion";

import chainlinkIcon from "../assets/icons/chainlink.png";
import erc8004Icon from "../assets/icons/8004scan.png";
import openclawIcon from "../assets/icons/openclaw.png";
import claudeIcon from "../assets/icons/claude.png";
import openaiIcon from "../assets/icons/openai.svg";

function OrbitIcon({ src, alt }: { src: ImageMetadata | string; alt: string }) {
  const imgSrc = typeof src === "string" ? src : src.src;
  return (
    <div className="flex h-full w-full items-center justify-center rounded-full border border-white/10 bg-neutral-900 overflow-hidden p-2">
      <img src={imgSrc} alt={alt} className="w-full h-full object-contain" />
    </div>
  );
}

const features = [
  {
    area: "md:[grid-area:1/1/2/4]",
    title: "Let AI Agents Securely Grow Your Portfolio",
    description: (
      <>
        Subscribe to an AI agent that actively manages your portfolio — executing trades, predictions, borrow, and repay on your behalf to{" "}
        <span className="text-white font-medium">earn additional yield</span>. Payments run on{" "}
        <span className="text-white font-medium">X402 micropayments</span>, while a{" "}
        <span className="text-white font-medium">42+ rule on-chain policy engine</span> via <span className="text-white font-medium">Chainlink CRE</span> keeps every agent action within your risk limits.
      </>
    ),
    pillar: "Safety & Trust",
    header: (
      <div className="relative flex h-full w-full items-center justify-center overflow-hidden" style={{ minHeight: 280 }}>
        {/* Center: Chainlink logo */}
        <div className="absolute z-10 w-[90px] h-[90px] rounded-full border border-white/[0.08] flex items-center justify-center overflow-hidden p-4" style={{ background: "linear-gradient(189deg, #252525 5.97%, #0E0E0E 92.92%)" }}>
          <img src={typeof chainlinkIcon === "string" ? chainlinkIcon : chainlinkIcon.src} alt="Chainlink" className="w-full h-full object-contain" />
        </div>
        {/* Inner orbit */}
        <OrbitingCircles radius={100} duration={25} speed={1} iconSize={48}>
          <div className="flex h-full w-full items-center justify-center rounded-full border border-white/10 bg-neutral-900">
            <span className="text-[9px] font-bold text-white tracking-tight leading-none">ERC-8004</span>
          </div>
          <div className="flex h-full w-full items-center justify-center rounded-full border border-white/10 bg-neutral-900">
            <span className="text-[9px] font-bold text-white tracking-tight leading-none">X402</span>
          </div>
          <OrbitIcon src={erc8004Icon} alt="ERC-8004" />
        </OrbitingCircles>
        {/* Outer orbit reverse */}
        <OrbitingCircles radius={155} duration={30} speed={1} reverse iconSize={48}>
          <OrbitIcon src={openclawIcon} alt="OpenClaw" />
          <OrbitIcon src={claudeIcon} alt="Claude" />
          <OrbitIcon src={openaiIcon} alt="OpenAI" />
        </OrbitingCircles>
      </div>
    ),
  },
  {
    area: "md:[grid-area:1/4/2/6]",
    title: "Borrow from Your Portfolio",
    description: (
      <>
        Borrow instantly against your{" "}
        <span className="text-white font-medium">open orders</span> and{" "}
        <span className="text-white font-medium">prediction stakes</span> — without closing positions or interrupting your trades.
      </>
    ),
    pillar: "Capital Efficiency",
    header: (
      <ThreeDMarquee
        images={[
          "/tokens/ethereum-eth-logo.svg",
          "/tokens/bitcoin-btc-logo.svg",
          "/tokens/usd-coin-usdc-logo.svg",
          "/tokens/mantle-mnt-logo.svg",
          "/tokens/IDRX.svg",
          "/tokens/XAU.svg",
          "/tokens/XAG.svg",
          "/tokens/NVDA.svg",
          "/tokens/AAPL.svg",
          "/tokens/GOOGL.svg",
          "/tokens/sxWETH.svg",
          "/tokens/sxWBTC.svg",
          "/tokens/sxUSDC.svg",
          "/tokens/sxMNT.svg",
          "/tokens/sxIDRX.svg",
          "/tokens/sxXAU.svg",
          "/tokens/sxNVDA.svg",
          "/tokens/sxAAPL.svg",
          "/tokens/sxGOOGL.svg",
          "/tokens/sxXAG.svg",
        ]}
      />
    ),
  },
  {
    area: "md:[grid-area:2/1/3/3]",
    title: "Smart Borrow & Repay",
    description: (
      <>
        Set a <span className="text-white font-medium">strategic limit order</span> and pair it with{" "}
        <span className="text-white font-medium">auto-repay</span> — your loan gets repaid automatically at a cheaper price. No manual monitoring needed.
      </>
    ),
    pillar: "Safety",
    header: <RepayCards />,
  },
  {
    area: "md:[grid-area:2/3/3/6]",
    title: "Trading or Betting while Earning",
    description: (
      <>
        When you deposit, your assets are{" "}
        <span className="text-white font-medium">automatically lent</span> and you receive{" "}
        <span className="text-white font-medium">sxTokens</span> — ownership representations that let you{" "}
        <span className="text-white font-medium">trade or bet</span> as usual, while passively earning{" "}
        <span className="text-white font-medium">lending yield</span> in the background.
      </>
    ),
    pillar: "Capital Efficiency",
    header: <TradeBeamHeader />,
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
