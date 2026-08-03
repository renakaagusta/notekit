import type { Metadata } from "next";
import { Hanken_Grotesk } from "next/font/google";
import "./globals.css";

const hankenGrotesk = Hanken_Grotesk({
  variable: "--font-hanken-grotesk",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: {
    default: "ScaleX - Revolutionary DeFi Platform | Trade While Earning Yield",
    template: "ScaleX"
  },
  description: "Experience the DeFi Flywheel with ScaleX. Trade your assets while they earn yield through our revolutionary platform that maximizes capital efficiency with intelligent automation.",
  keywords: [
    "DeFi",
    "Decentralized Finance",
    "Yield Farming",
    "Trading",
    "Capital Efficiency",
    "Cryptocurrency",
    "Automated Trading",
    "DeFi Platform",
    "Liquidity Mining",
    "Smart Contracts"
  ],
  authors: [{ name: "ScaleX Team" }],
  creator: "ScaleX",
  publisher: "ScaleX",
  icons: {
    icon: '/images/logo/ScaleX.webp',
    shortcut: '/images/logo/ScaleX.webp',
    apple: '/images/logo/ScaleX.webp',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${hankenGrotesk.variable} antialiased font-hanken`}
      >
        {children}
      </body>
    </html>
  );
}