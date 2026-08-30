'use client';

import { useState } from 'react';
import { Preview } from '@/components/showcase/preview';

const TABS = ['Notes', 'Tasks', 'Links'];
const BODY: Record<string, string> = {
  Notes: 'Markdown notes, git-backed and end-to-end encrypted.',
  Tasks: 'Tickets with subtasks, statuses, and human-friendly keys.',
  Links: 'Saved links with previews, encrypted alongside everything else.',
};

export function TabsShowcase() {
  const [active, setActive] = useState(TABS[0]);
  return (
    <Preview>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div
          style={{
            display: 'inline-flex',
            gap: 2,
            padding: 2,
            borderRadius: 8,
            background: 'var(--color-fd-muted)',
          }}
        >
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActive(tab)}
              style={{
                padding: '5px 12px',
                fontSize: 13,
                fontWeight: 590,
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
                background: active === tab ? 'var(--color-fd-background)' : 'transparent',
                color:
                  active === tab
                    ? 'var(--color-fd-foreground)'
                    : 'var(--color-fd-muted-foreground)',
                boxShadow: active === tab ? '0 1px 2px rgba(0,0,0,0.12)' : 'none',
              }}
            >
              {tab}
            </button>
          ))}
        </div>
        <p style={{ margin: '14px 2px 0', fontSize: 13, color: 'var(--color-fd-muted-foreground)' }}>
          {BODY[active]}
        </p>
      </div>
    </Preview>
  );
}
