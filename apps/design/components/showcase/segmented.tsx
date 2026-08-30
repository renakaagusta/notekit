'use client';

import { useState } from 'react';
import { Preview } from '@/components/showcase/preview';

const COLOR_MUTED_FOREGROUND = 'var(--color-fd-muted-foreground)';

interface Segment<T extends string> { label: string; value: T }

function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
}: {
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div
      style={{
        display: 'inline-flex',
        gap: 2,
        padding: 2,
        borderRadius: 8,
        background: 'var(--color-fd-muted)',
      }}
    >
      {segments.map((segment) => {
        const isActive = segment.value === value;
        return (
          <button
            key={segment.value}
            type="button"
            onClick={() => onChange(segment.value)}
            style={{
              height: 28,
              padding: '0 12px',
              fontSize: 13,
              fontWeight: 590,
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              background: isActive ? 'var(--color-fd-background)' : 'transparent',
              color: isActive ? 'var(--color-fd-foreground)' : COLOR_MUTED_FOREGROUND,
              boxShadow: isActive ? '0 1px 2px rgba(0,0,0,0.12)' : 'none',
              transition: 'background 120ms, color 120ms, box-shadow 120ms',
            }}
          >
            {segment.label}
          </button>
        );
      })}
    </div>
  );
}

const FILTER_SEGMENTS: Segment<'all' | 'active' | 'done'>[] = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Done', value: 'done' },
];

const DENSITY_SEGMENTS: Segment<'comfortable' | 'compact'>[] = [
  { label: 'Comfortable', value: 'comfortable' },
  { label: 'Compact', value: 'compact' },
];

export function SegmentedShowcase() {
  const [filter, setFilter] = useState<'all' | 'active' | 'done'>('all');
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');

  return (
    <Preview>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span
            style={{ fontSize: 11, fontWeight: 600, color: COLOR_MUTED_FOREGROUND, textTransform: 'uppercase', letterSpacing: '0.06em' }}
          >
            Task filter
          </span>
          <SegmentedControl segments={FILTER_SEGMENTS} value={filter} onChange={setFilter} />
          <span style={{ fontSize: 13, color: COLOR_MUTED_FOREGROUND }}>
            Showing:{' '}
            <strong style={{ color: 'var(--color-fd-foreground)' }}>
              {FILTER_SEGMENTS.find((s) => s.value === filter)?.label}
            </strong>
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span
            style={{ fontSize: 11, fontWeight: 600, color: COLOR_MUTED_FOREGROUND, textTransform: 'uppercase', letterSpacing: '0.06em' }}
          >
            List density
          </span>
          <SegmentedControl segments={DENSITY_SEGMENTS} value={density} onChange={setDensity} />
          <span style={{ fontSize: 13, color: COLOR_MUTED_FOREGROUND }}>
            Mode:{' '}
            <strong style={{ color: 'var(--color-fd-foreground)' }}>
              {DENSITY_SEGMENTS.find((s) => s.value === density)?.label}
            </strong>
          </span>
        </div>
      </div>
    </Preview>
  );
}
