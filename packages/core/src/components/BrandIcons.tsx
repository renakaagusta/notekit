interface IconProps {
  size?: number;
  className?: string;
}

/** GitHub Octocat mark (official, monochrome — inherits currentColor). */
export function GithubIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

/** GitLab tanuki logo (official brand colors). */
export function GitlabIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden
    >
      <path
        fill="#E24329"
        d="m23.6 9.59-.03-.08L20.34.92a.86.86 0 0 0-.84-.55.86.86 0 0 0-.79.62l-2.2 6.75H7.49L5.29.99a.86.86 0 0 0-.79-.62.86.86 0 0 0-.84.55L.43 9.51l-.03.08a6.07 6.07 0 0 0 2.01 7.01l.04.03 4.98 3.73 2.46 1.86 1.5 1.13a1.01 1.01 0 0 0 1.22 0l1.5-1.13 2.46-1.86 5.01-3.75a6.07 6.07 0 0 0 2.01-7.05Z"
      />
      <path
        fill="#FC6D26"
        d="m23.6 9.59-.03-.08a11.04 11.04 0 0 0-4.4 1.98L12 16.86l4.5 3.4 5.01-3.75a6.07 6.07 0 0 0 2.01-7.05Z"
      />
      <path
        fill="#FCA326"
        d="m7.5 20.26 2.46 1.86 1.5 1.13a1.01 1.01 0 0 0 1.22 0l1.5-1.13 2.46-1.86-4.5-3.4-4.5 3.4Z"
      />
      <path
        fill="#FC6D26"
        d="M4.83 11.49a11.04 11.04 0 0 0-4.4-1.98l-.03.08a6.07 6.07 0 0 0 2.01 7.01l.04.03 4.98 3.73 4.5-3.4-7.1-5.37Z"
      />
    </svg>
  );
}

/** NoteKit app icon (rounded square + monochrome slash). */
export function NotekitIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      aria-hidden
    >
      <rect x="0" y="0" width="64" height="64" rx="14.08" fill="#18181b" />
      <line
        x1="22"
        y1="50"
        x2="42"
        y2="14"
        stroke="#fafafa"
        strokeWidth="8.32"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** MetaMask fox mark (simplified, brand orange). */
export function MetaMaskIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
    >
      <path d="M21.5 3 13.4 9l1.5-3.5L21.5 3Z" fill="#E2761B" />
      <path d="m2.5 3 8 6.05L9.1 5.5 2.5 3Z" fill="#E4761B" />
      <path d="m18.6 16.3-2.15 3.3 4.6 1.27 1.32-4.5-3.77-.07ZM1.64 16.37 2.95 20.87l4.6-1.27-2.15-3.3-3.76.07Z" fill="#E4761B" />
      <path d="m7.3 10.6-1.28 1.94 4.56.2-.16-4.9L7.3 10.6ZM16.7 10.6l-3.17-2.8-.1 4.94 4.55-.2-1.28-1.94ZM7.55 19.6l2.74-1.34-2.37-1.85-.37 3.19ZM13.71 18.26l2.74 1.34-.36-3.19-2.38 1.85Z" fill="#E4761B" />
      <path d="m16.45 19.6-2.74-1.34.22 1.79-.02.76 2.54-1.21ZM7.55 19.6l2.54 1.21-.02-.76.22-1.79L7.55 19.6Z" fill="#D7C1B3" />
      <path d="m10.13 15.07-2.29-.67 1.62-.74.67 1.41ZM13.87 15.07l.67-1.41 1.63.74-2.3.67Z" fill="#233447" />
      <path d="m7.55 19.6.39-3.3-2.54.07 2.15 3.23ZM16.06 16.3l.39 3.3 2.15-3.23-2.54-.07ZM17.98 12.54l-4.55.2.42 2.33.67-1.41 1.63.74 1.83-1.86ZM7.84 14.4l1.62-.74.67 1.41.43-2.33-4.56-.2 1.84 1.86Z" fill="#CD6116" />
      <path d="m6.02 12.54 1.91 3.73-.07-1.87-1.84-1.86ZM16.15 14.4l-.08 1.87 1.91-3.73-1.83 1.86ZM10.58 12.74l-.43 2.33.54 2.77.12-3.65-.23-1.45ZM13.43 12.74l-.22 1.44.1 3.66.54-2.77-.42-2.33Z" fill="#E4751F" />
      <path d="m13.87 15.07-.54 2.77.39.27 2.37-1.85.08-1.87-2.3.68ZM7.84 14.4l.07 1.87 2.37 1.85.39-.27-.54-2.77-2.29-.68Z" fill="#F6851B" />
      <path d="m13.91 20.81.02-.76-.2-.18h-3.46l-.2.18.02.76L7.55 19.6l.9.74 1.82 1.26h3.46l1.82-1.26.9-.74-2.54 1.21Z" fill="#C0AD9E" />
      <path d="m13.71 18.26-.39-.27h-2.64l-.39.27-.22 1.79.2-.18h3.46l.2.18-.22-1.79Z" fill="#161616" />
      <path d="M21.84 9.4 22.5 6 21.5 3l-7.79 5.78 3 2.54 4.24 1.24 1.5-1.75-.65-.47.65-.59-.5-.39.65-.5-.51-.46ZM1.5 6l.66 3.4-.52.46.66.5-.5.39.65.59-.65.47 1.5 1.75 4.24-1.24 3-2.54L2.5 3 1.5 6Z" fill="#763D16" />
      <path d="m21.45 12.56-4.24-1.24 1.28 1.94-1.91 3.73 2.53-.03h3.77l-1.43-4.4ZM7.3 11.32l-4.24 1.24-1.42 4.4h3.76l2.53.03-1.9-3.73 1.27-1.94ZM13.43 12.74l.28-4.66 1.23-3.32H9.07l1.22 3.32.29 4.66.1 1.46.01 3.64h2.64l.02-3.64.1-1.46Z" fill="#F6851B" />
    </svg>
  );
}

/** Rabby mark (simplified, brand blue-purple). */
export function RabbyIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id="rabbyG" x1="3" y1="6" x2="21" y2="18" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8697FF" />
          <stop offset="1" stopColor="#5C73FF" />
        </linearGradient>
      </defs>
      <path
        d="M21.4 13.7c.7-1.3-2.2-4.9-5-6.7-2-1.5-4-1.6-4.9-.5-1.3 1.5.6 3 .2 3.4-.2.2-.7-.2-1.6-.3-2.3-.2-4.7 1-5.4 3.1-.7 2 .3 4.2 3.3 5.2 2.9 1 4.2.5 6.7.9 2.4.3 3.5 2.1 4.9 1.7 1-.3 1-1.7.2-2.6-.6-.6-1.6-1-1.3-1.4.2-.4 2.1.2 2.7-.5Z"
        fill="url(#rabbyG)"
      />
      <circle cx="16.4" cy="11.2" r="1" fill="#fff" />
    </svg>
  );
}

/** Coinbase Wallet mark (brand blue). */
export function CoinbaseIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="11" fill="#0052FF" />
      <rect x="9" y="9" width="6" height="6" rx="1.2" fill="#fff" />
    </svg>
  );
}

/** WalletConnect mark (brand blue arcs). */
export function WalletConnectIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="11" fill="#3B99FC" />
      <path
        d="M7.2 9.7a6.8 6.8 0 0 1 9.6 0l.32.31a.33.33 0 0 1 0 .47l-1.1 1.07a.17.17 0 0 1-.24 0l-.44-.43a4.74 4.74 0 0 0-6.7 0l-.47.46a.17.17 0 0 1-.24 0l-1.1-1.07a.33.33 0 0 1 0-.47l.36-.35Zm11.86 2.2 .98.96a.33.33 0 0 1 0 .47l-4.42 4.32a.35.35 0 0 1-.48 0l-3.14-3.07a.09.09 0 0 0-.12 0L8.74 17.6a.35.35 0 0 1-.48 0L3.84 13.3a.33.33 0 0 1 0-.47l.98-.96a.35.35 0 0 1 .48 0l3.14 3.07a.09.09 0 0 0 .12 0l3.13-3.07a.35.35 0 0 1 .48 0l3.14 3.07a.09.09 0 0 0 .12 0l3.14-3.07a.35.35 0 0 1 .47 0Z"
        fill="#fff"
      />
    </svg>
  );
}

/** Generic wallet glyph (monochrome, inherits currentColor). */
export function WalletIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
    >
      <rect x="3" y="6" width="18" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 9h18" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="16.5" cy="13.5" r="1.4" fill="currentColor" />
    </svg>
  );
}
