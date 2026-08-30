// Hand-drawn hero diagram: the key hierarchy, from either seed source down to
// the per-vault content key. Themed with Fumadocs CSS variables. Static SVG.
export function KeyHierarchyDiagram() {
  const box = { fill: 'var(--color-fd-card)', stroke: 'var(--color-fd-border)' };
  const title = { fill: 'var(--color-fd-foreground)', fontSize: 12.5, fontWeight: 600 };
  const sub = { fill: 'var(--color-fd-muted-foreground)', fontSize: 10.5 };
  const stroke = 'var(--color-fd-muted-foreground)';

  return (
    <figure style={{ margin: '1.5rem 0', overflowX: 'auto' }}>
      <svg viewBox="0 0 720 360" width="100%" role="img" aria-label="NoteKit key hierarchy" style={{ fontFamily: 'var(--font-sans)' }}>
        <defs>
          <marker id="kh-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill={stroke} />
          </marker>
        </defs>

        {/* Seed sources */}
        <rect x="20" y="16" width="200" height="58" rx="8" {...box} strokeWidth={1} />
        <text x="34" y="40" style={title}>24-word recovery phrase</text>
        <text x="34" y="58" style={sub}>BIP39, 256-bit · passphrase v1</text>

        <rect x="20" y="90" width="200" height="58" rx="8" {...box} strokeWidth={1} />
        <text x="34" y="114" style={title}>EVM wallet signature</text>
        <text x="34" y="132" style={sub}>personal_sign → HKDF-SHA256</text>

        {/* Seed */}
        <rect x="280" y="52" width="150" height="60" rx="8" fill="var(--color-fd-muted)" stroke="var(--color-fd-border)" />
        <text x="296" y="78" style={title}>64-byte seed</text>
        <text x="296" y="96" style={sub}>deterministic</text>

        <line x1="220" y1="45" x2="280" y2="70" stroke={stroke} strokeWidth={1.4} markerEnd="url(#kh-arrow)" />
        <line x1="220" y1="119" x2="280" y2="94" stroke={stroke} strokeWidth={1.4} markerEnd="url(#kh-arrow)" />

        {/* Derived identity keys */}
        <rect x="490" y="16" width="210" height="64" rx="8" {...box} strokeWidth={1} />
        <text x="504" y="40" style={title}>Age identity (X25519)</text>
        <text x="504" y="58" style={sub}>seed[0:32] → AGE-SECRET-KEY-</text>
        <text x="504" y="72" style={sub}>decrypts the vault key</text>

        <rect x="490" y="96" width="210" height="64" rx="8" {...box} strokeWidth={1} />
        <text x="504" y="120" style={title}>Signing key (Ed25519)</text>
        <text x="504" y="138" style={sub}>SHA-512(domain ‖ seed)[0:32]</text>
        <text x="504" y="152" style={sub}>master root of trust — stays cold</text>

        <line x1="430" y1="74" x2="490" y2="48" stroke={stroke} strokeWidth={1.4} markerEnd="url(#kh-arrow)" />
        <line x1="430" y1="90" x2="490" y2="126" stroke={stroke} strokeWidth={1.4} markerEnd="url(#kh-arrow)" />

        {/* Per-device */}
        <rect x="20" y="196" width="320" height="140" rx="10" fill="none" stroke="var(--color-fd-border)" strokeDasharray="5 4" />
        <text x="36" y="218" style={sub}>PER DEVICE — random, local only</text>
        <rect x="36" y="232" width="140" height="88" rx="8" {...box} strokeWidth={1} />
        <text x="50" y="256" style={title}>Device age key</text>
        <text x="50" y="274" style={sub}>random X25519</text>
        <text x="50" y="290" style={sub}>a keybox recipient</text>
        <rect x="188" y="232" width="140" height="88" rx="8" {...box} strokeWidth={1} />
        <text x="202" y="256" style={title}>Device sign key</text>
        <text x="202" y="274" style={sub}>random Ed25519</text>
        <text x="202" y="290" style={sub}>signs roster + keybox</text>

        {/* Vault key / keybox */}
        <rect x="380" y="196" width="320" height="140" rx="10" fill="none" stroke="var(--color-fd-border)" strokeDasharray="5 4" />
        <text x="396" y="218" style={sub}>PER VAULT — envelope encryption</text>
        <rect x="396" y="232" width="288" height="44" rx="8" fill="var(--color-fd-muted)" stroke="var(--color-fd-border)" />
        <text x="410" y="259" style={title}>Vault key (random X25519) → encrypts all content</text>
        <rect x="396" y="286" width="288" height="34" rx="8" {...box} strokeWidth={1} />
        <text x="410" y="307" style={sub}>keybox.age = vault key wrapped to every device + recovery</text>

        <line x1="320" y1="278" x2="392" y2="256" stroke={stroke} strokeWidth={1.4} markerEnd="url(#kh-arrow)" />
        <line x1="595" y1="160" x2="560" y2="230" stroke={stroke} strokeWidth={1.4} markerEnd="url(#kh-arrow)" />
      </svg>
    </figure>
  );
}
