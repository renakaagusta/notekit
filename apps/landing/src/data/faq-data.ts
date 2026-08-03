export interface FAQItem {
  question: string
  answer: string
}

export interface FAQCategory {
  id: string
  title: string
  items: FAQItem[]
}

export const landingFAQs: FAQItem[] = [
  {
    question: "What is NoteKit?",
    answer:
      "NoteKit is an end-to-end encrypted note-taking app that syncs via Git. Your notes are encrypted on your device before they're ever stored anywhere — the server (and we) never see your plaintext.",
  },
  {
    question: "Is NoteKit really open source?",
    answer:
      "Yes. The clients (web, desktop, mobile, CLI) are MIT licensed. The sync server is AGPL. All code is on GitHub.",
  },
  {
    question: "How much does NoteKit cost?",
    answer:
      "NoteKit Free is completely free forever. NoteKit Plus is $1.49/month, $14.99/year, or a one-time lifetime purchase ($49–$79). Plus gives you managed Forgejo sync, priority support, and extended history.",
  },
  {
    question: "What is age encryption?",
    answer:
      "age is a modern file encryption tool designed by the Go team. NoteKit uses X25519 key pairs per device. Only your devices can decrypt your notes. The server stores ciphertext it cannot read.",
  },
  {
    question: "How do AI agents access my notes?",
    answer:
      "NoteKit ships an MCP (Model Context Protocol) server. You drop it into Claude Code, Cursor, or any MCP host. Agents only access notes you explicitly grant — least-privilege by design. Every agent write is a signed Git commit you can review.",
  },
  {
    question: "Can I self-host?",
    answer:
      "Yes. The sync server is AGPL and Docker-ready. You can run your own Forgejo and point NoteKit at it. You own the full stack.",
  },
  {
    question: "What happens if I lose my device?",
    answer:
      "Recovery is via a 24-word BIP39 phrase generated at setup. Keep it offline. You can also recover via another already-paired device. The phrase re-derives your master key; no server involvement needed.",
  },
  {
    question: "Does NoteKit work offline?",
    answer:
      "Yes. NoteKit is offline-first. Write, edit, and organize notes without an internet connection. Changes sync the next time you're online.",
  },
]

export const faqCategories: FAQCategory[] = [
  {
    id: "general",
    title: "General",
    items: [
      {
        question: "What is NoteKit?",
        answer:
          "NoteKit is an end-to-end encrypted note-taking app that syncs via Git. Your notes are encrypted on your device before they're ever stored anywhere — the server (and we) never see your plaintext.",
      },
      {
        question: "Is NoteKit really open source?",
        answer:
          "Yes. The clients (web, desktop, mobile, CLI) are MIT licensed. The sync server is AGPL. All code is on GitHub.",
      },
      {
        question: "Who is NoteKit for?",
        answer:
          "NoteKit is for anyone who takes their privacy seriously: journalists, researchers, web3 users, developers, and anyone else who wants their notes to belong to them — not a cloud provider. It also has first-class support for AI agent workflows via MCP.",
      },
      {
        question: "How is NoteKit different from Obsidian or Notion?",
        answer:
          "Obsidian Sync sends your notes to their servers (optionally encrypted, but you're trusting them). Notion is fully cloud-dependent plaintext. NoteKit encrypts on your device with age before any data leaves — zero-knowledge by design. Git gives you the audit trail and portability.",
      },
    ],
  },
  {
    id: "pricing",
    title: "Pricing",
    items: [
      {
        question: "How much does NoteKit cost?",
        answer:
          "NoteKit Free is completely free forever. NoteKit Plus is $1.49/month, $14.99/year, or a one-time lifetime purchase ($49–$79). Plus gives you managed Forgejo sync, priority support, and extended history.",
      },
      {
        question: "What's included in the free tier?",
        answer:
          "Free includes unlimited notes, E2EE on all notes, offline-first editing, and BYO Git repo sync (connect your own GitHub, GitLab, or Forgejo). Plus adds managed Forgejo, extended history, and priority support.",
      },
      {
        question: "What payment methods are accepted?",
        answer:
          "Plus is available via Apple in-app purchase (iOS/macOS), Google Play (Android), and Stripe or Lemon Squeezy on the web. Lifetime purchases are web-only.",
      },
    ],
  },
  {
    id: "security",
    title: "Security & Privacy",
    items: [
      {
        question: "What is age encryption?",
        answer:
          "age is a modern file encryption tool designed by the Go team. NoteKit uses X25519 key pairs per device. Only your devices can decrypt your notes. The server stores ciphertext it cannot read.",
      },
      {
        question: "What happens if I lose my device?",
        answer:
          "Recovery is via a 24-word BIP39 phrase generated at setup. Keep it offline. You can also recover via another already-paired device. The phrase re-derives your master key; no server involvement needed.",
      },
      {
        question: "Can NoteKit employees read my notes?",
        answer:
          "No. The sync server stores age ciphertext. We do not hold your private keys or recovery phrase. Even if compelled, we cannot produce your plaintext.",
      },
      {
        question: "Is NoteKit audited?",
        answer:
          "The cryptographic layer (age + X25519 envelope encryption) uses well-audited open source libraries. A third-party audit of the NoteKit-specific key management code is on the roadmap.",
      },
    ],
  },
  {
    id: "agents",
    title: "AI Agents",
    items: [
      {
        question: "How do AI agents access my notes?",
        answer:
          "NoteKit ships an MCP (Model Context Protocol) server. Drop it into Claude Code, Cursor, or any MCP host. Agents only access notes you explicitly grant. Every agent write is a signed Git commit you can review and roll back.",
      },
      {
        question: "What is MCP?",
        answer:
          "MCP (Model Context Protocol) is an open standard for giving AI assistants structured access to tools and data. NoteKit's MCP server exposes your granted notes as live context for any compatible AI client.",
      },
      {
        question: "Can an agent read all my notes?",
        answer:
          "No. By default agents have no access. You grant access per-folder or per-note. The agent gets its own age key pair and can only decrypt notes explicitly encrypted to that key.",
      },
      {
        question: "Can I see what an agent wrote?",
        answer:
          "Yes. Every agent write is a Git commit signed with the agent's key. You can git log, git diff, and git revert just like any other commit.",
      },
    ],
  },
  {
    id: "technical",
    title: "Technical",
    items: [
      {
        question: "Can I self-host?",
        answer:
          "Yes. The sync server is AGPL and Docker-ready. You can run your own Forgejo and point NoteKit at it. Full instructions in the docs.",
      },
      {
        question: "Does NoteKit work offline?",
        answer:
          "Yes. NoteKit is offline-first. Write, edit, and organize notes without an internet connection. Changes sync the next time you're online via Git.",
      },
      {
        question: "What platforms does NoteKit support?",
        answer:
          "Web, Electron desktop (macOS, Windows, Linux), iOS, and Android. All share the same encrypted vault format.",
      },
      {
        question: "What note format does NoteKit use?",
        answer:
          "Standard Markdown files, encrypted with age. When decrypted, they're plain .md files you can open in any editor. No proprietary format.",
      },
    ],
  },
]
