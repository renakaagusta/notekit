// Hand-drawn hero diagram: where plaintext lives vs. where only ciphertext
// travels. Themed with Fumadocs CSS variables so it tracks light/dark. Static
// SVG (no client JS) — safe to render on the server.
export function SystemArchitectureDiagram() {
  const box = {
    fill: 'var(--color-fd-card)',
    stroke: 'var(--color-fd-border)',
  };
  const label = { fill: 'var(--color-fd-foreground)', fontSize: 13, fontWeight: 600 };
  const sub = { fill: 'var(--color-fd-muted-foreground)', fontSize: 11 };

  return (
    <figure style={{ margin: '1.5rem 0', overflowX: 'auto' }}>
      <svg viewBox="0 0 720 320" width="100%" role="img" aria-label="NoteKit system architecture" style={{ fontFamily: 'var(--font-sans)' }}>
        {/* Trusted zone — the device */}
        <rect x="8" y="8" width="300" height="304" rx="12" fill="none" stroke="var(--color-fd-border)" strokeDasharray="5 4" />
        <text x="24" y="30" style={sub}>YOUR DEVICE — plaintext + private keys</text>

        <rect x="28" y="48" width="118" height="64" rx="8" {...box} strokeWidth={1} />
        <text x="42" y="76" style={label}>Editor / UI</text>
        <text x="42" y="94" style={sub}>notes, tasks</text>

        <rect x="166" y="48" width="118" height="64" rx="8" {...box} strokeWidth={1} />
        <text x="180" y="76" style={label}>CLI / MCP</text>
        <text x="180" y="94" style={sub}>agent surface</text>

        <rect x="28" y="132" width="256" height="72" rx="8" fill="var(--color-fd-muted)" stroke="var(--color-fd-border)" />
        <text x="44" y="158" style={label}>Crypto core</text>
        <text x="44" y="176" style={sub}>age (X25519) · Ed25519 · BIP39</text>
        <text x="44" y="192" style={sub}>keys never leave this box</text>

        <rect x="28" y="224" width="256" height="60" rx="8" {...box} strokeWidth={1} />
        <text x="44" y="250" style={label}>Local key store</text>
        <text x="44" y="268" style={sub}>IndexedDB / OS keychain / disk</text>

        {/* Encryption boundary */}
        <line x1="330" y1="24" x2="330" y2="296" stroke="var(--color-fd-primary)" strokeWidth={1.5} />
        <text x="338" y="20" style={{ ...sub, fill: 'var(--color-fd-primary)' }}>encryption boundary — only ciphertext crosses →</text>

        {/* Untrusted zone — the server */}
        <rect x="360" y="8" width="352" height="304" rx="12" fill="none" stroke="var(--color-fd-border)" strokeDasharray="5 4" />
        <text x="376" y="30" style={sub}>SERVER — sees ciphertext + metadata only</text>

        <rect x="380" y="48" width="140" height="64" rx="8" {...box} strokeWidth={1} />
        <text x="394" y="76" style={label}>NoteKit API</text>
        <text x="394" y="94" style={sub}>Hono · auth · relay</text>

        <rect x="540" y="48" width="152" height="64" rx="8" {...box} strokeWidth={1} />
        <text x="554" y="76" style={label}>Git vault</text>
        <text x="554" y="94" style={sub}>Forgejo / GitHub / GitLab</text>

        <rect x="380" y="140" width="312" height="144" rx="8" fill="var(--color-fd-muted)" stroke="var(--color-fd-border)" />
        <text x="396" y="166" style={label}>Repository contents</text>
        <text x="396" y="188" style={sub}>notes/&lt;id&gt;.md.age — armored ciphertext</text>
        <text x="396" y="206" style={sub}>.notekit/keybox.age — wrapped vault key</text>
        <text x="396" y="224" style={sub}>.notekit/roster/*.json — signed device list</text>
        <text x="396" y="242" style={sub}>visible metadata: folders, timestamps,</text>
        <text x="396" y="258" style={sub}>ticket status, file sizes, commit authors</text>

        {/* Flow arrow */}
        <line x1="284" y1="168" x2="376" y2="168" stroke="var(--color-fd-muted-foreground)" strokeWidth={1.5} markerEnd="url(#arrow)" />
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="var(--color-fd-muted-foreground)" />
          </marker>
        </defs>
      </svg>
    </figure>
  );
}
