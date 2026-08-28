'use client';

import { Check, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { PhoneFrame } from '@/components/showcase/phone-frame';
import { Preview } from '@/components/showcase/preview';

const OPTIONS = ['Personal', 'Work', 'Shared', 'Archive'];

const trigger: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  height: 32,
  padding: '0 10px',
  minWidth: 180,
  borderRadius: 6,
  border: '1px solid var(--color-fd-border)',
  background: 'var(--color-fd-background)',
  color: 'var(--color-fd-foreground)',
  fontSize: 13,
  fontFamily: 'inherit',
  cursor: 'pointer',
};

const item = (active: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '7px 10px',
  fontSize: 13,
  cursor: 'pointer',
  borderRadius: 5,
  color: 'var(--color-fd-foreground)',
  background: active ? 'var(--color-fd-accent)' : 'transparent',
});

export function SelectShowcase() {
  const [value, setValue] = useState(OPTIONS[0]);
  const [open, setOpen] = useState(false);
  return (
    <Preview>
      <div style={{ position: 'relative' }}>
        <button type="button" style={trigger} onClick={() => setOpen((current) => !current)}>
          {value}
          <ChevronDown size={14} style={{ opacity: 0.6 }} />
        </button>
        {open ? (
          <div
            style={{
              position: 'absolute',
              top: 36,
              left: 0,
              minWidth: 180,
              padding: 4,
              background: 'var(--color-fd-popover)',
              border: '1px solid var(--color-fd-border)',
              borderRadius: 8,
              boxShadow: '0px 4px 24px rgba(0,0,0,0.2)',
              zIndex: 20,
            }}
          >
            {OPTIONS.map((option) => (
              <div
                key={option}
                style={item(option === value)}
                onClick={() => {
                  setValue(option);
                  setOpen(false);
                }}
              >
                {option}
                {option === value ? <Check size={14} /> : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </Preview>
  );
}

export function SelectSheetShowcase() {
  const [value, setValue] = useState(OPTIONS[0]);
  const [open, setOpen] = useState(true);
  return (
    <Preview>
      <PhoneFrame label="Picker · mobile">
        <div style={{ padding: '32px 16px 16px' }}>
          <div style={{ fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 12 }}>Move to</div>
          <button
            type="button"
            style={{ ...trigger, width: '100%' }}
            onClick={() => setOpen(true)}
          >
            {value}
            <ChevronDown size={14} style={{ opacity: 0.6 }} />
          </button>
        </div>

        {open ? (
          <div style={{ position: 'absolute', inset: 0, zIndex: 10 }}>
            <div
              onClick={() => setOpen(false)}
              style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }}
            />
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                background: 'var(--color-fd-popover)',
                borderRadius: '16px 16px 0 0',
                padding: '10px 12px 16px',
                boxShadow: '0px -7px 32px rgba(0,0,0,0.28)',
              }}
            >
              <div
                aria-hidden
                style={{
                  width: 36,
                  height: 4,
                  borderRadius: 9999,
                  background: 'var(--color-fd-border)',
                  margin: '0 auto 10px',
                }}
              />
              {OPTIONS.map((option) => (
                <div
                  key={option}
                  style={{ ...item(option === value), padding: '12px 10px' }}
                  onClick={() => {
                    setValue(option);
                    setOpen(false);
                  }}
                >
                  {option}
                  {option === value ? <Check size={16} /> : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </PhoneFrame>
    </Preview>
  );
}
