// Hand-drawn hero diagram: the hexagonal architecture — one core (domain +
// application) surrounded by driving adapters (surfaces) and driven adapters
// (outside world). Themed with Fumadocs CSS variables. Static SVG.
export function HexagonDiagram() {
  const title = { fill: 'var(--color-fd-foreground)', fontSize: 12.5, fontWeight: 600 };
  const sub = { fill: 'var(--color-fd-muted-foreground)', fontSize: 10.5 };
  const box = { fill: 'var(--color-fd-card)', stroke: 'var(--color-fd-border)' };

  return (
    <figure style={{ margin: '1.5rem 0', overflowX: 'auto' }}>
      <svg viewBox="0 0 720 380" width="100%" role="img" aria-label="NoteKit hexagonal architecture" style={{ fontFamily: 'var(--font-sans)' }}>
        {/* Driving side (surfaces call inward) */}
        <text x="24" y="24" style={sub}>DRIVING ADAPTERS — surfaces call inward</text>
        {['Web', 'Desktop', 'Mobile', 'CLI', 'MCP'].map((s, i) => (
          <g key={s}>
            <rect x={24} y={40 + i * 60} width="120" height="46" rx="8" {...box} strokeWidth={1} />
            <text x={40} y={68 + i * 60} style={title}>{s}</text>
          </g>
        ))}

        {/* Core hexagon */}
        <polygon
          points="360,60 470,120 470,260 360,320 250,260 250,120"
          fill="var(--color-fd-muted)"
          stroke="var(--color-fd-primary)"
          strokeWidth={1.5}
        />
        <text x="360" y="150" textAnchor="middle" style={{ ...title, fontSize: 14 }}>Core</text>
        <text x="360" y="176" textAnchor="middle" style={sub}>domain/</text>
        <text x="360" y="194" textAnchor="middle" style={sub}>entities · age crypto</text>
        <text x="360" y="218" textAnchor="middle" style={sub}>application/</text>
        <text x="360" y="236" textAnchor="middle" style={sub}>use cases · ports</text>
        <text x="360" y="262" textAnchor="middle" style={{ ...sub, fill: 'var(--color-fd-primary)' }}>no framework, no I/O</text>

        {/* Driven side (core drives outward) */}
        <text x="576" y="24" style={sub}>DRIVEN ADAPTERS</text>
        {[
          ['api-client', 'HTTP transport'],
          ['Vault / Git', 'ciphertext store'],
          ['Key store', 'IndexedDB / keychain'],
          ['Clock / Id', 'time · random'],
        ].map(([t, d], i) => (
          <g key={t}>
            <rect x={556} y={40 + i * 66} width="140" height="52" rx="8" {...box} strokeWidth={1} />
            <text x={572} y={64 + i * 66} style={title}>{t}</text>
            <text x={572} y={80 + i * 66} style={sub}>{d}</text>
          </g>
        ))}

        {/* Arrows: surfaces → core (inward) */}
        <defs>
          <marker id="hx-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="var(--color-fd-muted-foreground)" />
          </marker>
        </defs>
        <line x1="144" y1="190" x2="248" y2="190" stroke="var(--color-fd-muted-foreground)" strokeWidth={1.4} markerEnd="url(#hx-arrow)" />
        <text x="150" y="182" style={sub}>call inbound ports</text>
        {/* core → driven (outward) */}
        <line x1="472" y1="190" x2="554" y2="190" stroke="var(--color-fd-muted-foreground)" strokeWidth={1.4} markerEnd="url(#hx-arrow)" />
        <text x="476" y="182" style={sub}>via outbound ports</text>
      </svg>
    </figure>
  );
}
