export const languages = {
  en: { label: "English", flag: "EN" },
  id: { label: "Indonesia", flag: "ID" },
} as const;

export type Language = keyof typeof languages;

export const defaultLang: Language = "en";

export const translations = {
  en: {
    nav: {
      features: "Features",
      howItWorks: "How it works",
      docs: "Docs",
      community: "Community",
      blog: "Blog",
      launchApp: "Open App",
    },
    hero: {
      badge: "Open Source · MIT + AGPL",
      headline: "Your private second brain. E2E encrypted, Git-backed, agent-ready.",
      description: "Write in Markdown, encrypt with age, sync via Git. Your notes belong to you — not a cloud provider. AI agents read only what you grant them.",
      startTrading: "Open App",
      readDocs: "GitHub",
      totalVolume: "Open Source",
      limitOrderAPY: "E2EE by Default",
      tvl: "Agent-Ready",
    },
    problemSolution: {
      title: "Other note apps vs NoteKit.",
      subtitle: "Stop trading your privacy for convenience. Every time you type in Notion or Obsidian Sync, your notes leave your device in plaintext. NoteKit changes that.",
    },
    features: {
      title: "Built for Writers and Agents",
      subtitle: "Privacy, portability, and AI integration — all in one app.",
      subtitleBold: "Write more. Worry less. Automate freely.",
      agentMarketplace: {
        title: "MCP Agent Access",
        description: "Claude, Cursor, and any MCP client can read and write your notes — but only the notes you grant. E2EE keys, least-privilege by default.",
        stat: "MCP",
        statLabel: "Model Context Protocol",
      },
      predictions: {
        title: "Git-Backed Sync",
        description: "Every note is a file. Every save is a commit. Full history, diff, blame — on your own Forgejo, GitHub, or GitLab repo.",
        stat: "Git",
        statLabel: "Full History",
      },
      limitOrders: {
        title: "age Encryption",
        description: "Industry-standard age encryption (by the Go team). Device keys are X25519. Recovery via 24-word BIP39 phrase.",
        stat: "X25519",
        statLabel: "age Encrypted",
      },
      lending: {
        title: "Cross-Platform",
        description: "One vault, every device. Web, Electron desktop, Capacitor iOS & Android. Works offline — syncs when you reconnect.",
        stat: "5+",
        statLabel: "Platforms",
      },
    },
    whyAgents: {
      title: "Why Agents Need NoteKit",
      subtitle: "MCP-native from day one. Agents get exactly the context you want them to have — nothing more.",
    },
    techStack: {
      title: "Open Standards, All the Way Down",
      subtitle: "No proprietary formats. No lock-in. Every component is replaceable.",
    },
    comparison: {
      title: "NoteKit vs The Alternatives",
      subtitle: "See how NoteKit stacks up on the things that actually matter.",
    },
    faq: {
      title: "Frequently Asked Questions",
      subtitle: "Everything you need to know about NoteKit.",
    },
    cta: {
      title: "Own Your Notes.",
      subtitle: "Start free. No credit card. Full E2EE from day one.",
      primaryBtn: "Open App",
      secondaryBtn: "Star on GitHub",
    },
    footer: {
      description: "End-to-end encrypted notes for humans and agents. Open source, Git-backed, privacy-first.",
      copyright: "© 2025 NoteKit. Open source under MIT + AGPL.",
    },
  },
  id: {
    nav: {
      features: "Fitur",
      howItWorks: "Cara Kerja",
      docs: "Docs",
      community: "Komunitas",
      blog: "Blog",
      launchApp: "Buka Aplikasi",
    },
    hero: {
      badge: "Open Source · MIT + AGPL",
      headline: "Otak kedua pribadimu. Terenkripsi E2E, didukung Git, siap untuk agen AI.",
      description: "Tulis dalam Markdown, enkripsi dengan age, sinkron via Git. Catatanmu milikmu sendiri — bukan milik cloud provider. Agen AI hanya membaca apa yang kamu izinkan.",
      startTrading: "Buka Aplikasi",
      readDocs: "GitHub",
      totalVolume: "Open Source",
      limitOrderAPY: "E2EE Default",
      tvl: "Siap MCP",
    },
    problemSolution: {
      title: "Aplikasi catatan lain vs NoteKit.",
      subtitle: "Hentikan pertukaran privasi demi kemudahan. Setiap ketikan di Notion atau Obsidian Sync meninggalkan perangkatmu dalam bentuk plaintext. NoteKit mengubah itu.",
    },
    features: {
      title: "Dibangun untuk Penulis dan Agen",
      subtitle: "Privasi, portabilitas, dan integrasi AI — semua dalam satu aplikasi.",
      subtitleBold: "Tulis lebih banyak. Khawatir lebih sedikit. Otomasi dengan bebas.",
      agentMarketplace: {
        title: "Akses Agen MCP",
        description: "Claude, Cursor, dan klien MCP apapun bisa membaca dan menulis catatanmu — hanya yang kamu izinkan. Kunci E2EE, least-privilege secara default.",
        stat: "MCP",
        statLabel: "Model Context Protocol",
      },
      predictions: {
        title: "Sinkron berbasis Git",
        description: "Setiap catatan adalah file. Setiap simpan adalah commit. Riwayat lengkap, diff, blame — di repo Forgejo, GitHub, atau GitLab milikmu sendiri.",
        stat: "Git",
        statLabel: "Riwayat Lengkap",
      },
      limitOrders: {
        title: "Enkripsi age",
        description: "Enkripsi age standar industri (oleh tim Go). Kunci perangkat adalah X25519. Pemulihan via frasa BIP39 24 kata.",
        stat: "X25519",
        statLabel: "Terenkripsi age",
      },
      lending: {
        title: "Lintas Platform",
        description: "Satu vault, setiap perangkat. Web, desktop Electron, Capacitor iOS & Android. Bekerja offline — sinkron saat terhubung kembali.",
        stat: "5+",
        statLabel: "Platform",
      },
    },
    whyAgents: {
      title: "Mengapa Agen Butuh NoteKit",
      subtitle: "Native MCP sejak hari pertama. Agen mendapatkan konteks yang tepat yang kamu inginkan.",
    },
    techStack: {
      title: "Standar Terbuka, Sepenuhnya",
      subtitle: "Tidak ada format proprietary. Tidak ada lock-in. Setiap komponen bisa diganti.",
    },
    comparison: {
      title: "NoteKit vs Alternatif Lain",
      subtitle: "Lihat bagaimana NoteKit dibandingkan dalam hal-hal yang benar-benar penting.",
    },
    faq: {
      title: "Pertanyaan yang Sering Diajukan",
      subtitle: "Semua yang perlu kamu ketahui tentang NoteKit.",
    },
    cta: {
      title: "Miliki Catatanmu.",
      subtitle: "Mulai gratis. Tanpa kartu kredit. E2EE penuh sejak hari pertama.",
      primaryBtn: "Buka Aplikasi",
      secondaryBtn: "Bintangi di GitHub",
    },
    footer: {
      description: "Catatan terenkripsi ujung ke ujung untuk manusia dan agen. Open source, berbasis Git, privasi pertama.",
      copyright: "© 2025 NoteKit. Open source di bawah MIT + AGPL.",
    },
  },
};
