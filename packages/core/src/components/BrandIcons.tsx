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
