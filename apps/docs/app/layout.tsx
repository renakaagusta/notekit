import './global.css';
import { RootProvider } from 'fumadocs-ui/provider/next';
import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import type { ReactNode } from 'react';

const sans = Inter({ subsets: ['latin'], variable: '--font-nk-sans', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-nk-mono', display: 'swap' });

export const metadata: Metadata = {
  title: {
    default: 'NoteKit Docs',
    template: '%s · NoteKit Docs',
  },
  description:
    'Documentation for NoteKit — the git-backed, end-to-end-encrypted, MCP-first notes and tasks app.',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <body>
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
