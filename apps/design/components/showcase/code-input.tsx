'use client';

import { useRef, useState } from 'react';
import { Preview } from '@/components/showcase/preview';

const LENGTH = 6;

const cell = (filled: boolean, focused: boolean): React.CSSProperties => ({
  width: 40,
  height: 48,
  textAlign: 'center',
  fontSize: 20,
  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
  color: 'var(--color-fd-foreground)',
  background: 'var(--color-fd-background)',
  border: `1px solid ${focused ? 'var(--color-fd-ring)' : 'var(--color-fd-border)'}`,
  outline: focused ? '2px solid var(--color-fd-ring)' : 'none',
  outlineOffset: -1,
  borderRadius: 6,
  caretColor: 'var(--color-fd-foreground)',
});

function useCodeInput() {
  const [digits, setDigits] = useState<string[]>(Array(LENGTH).fill(''));
  const [focused, setFocused] = useState<number | null>(null);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const focus = (i: number) => refs.current[Math.max(0, Math.min(LENGTH - 1, i))]?.focus();

  const setAt = (i: number, value: string) => {
    const next = [...digits];
    next[i] = value;
    setDigits(next);
  };

  const onChange = (i: number, raw: string) => {
    const value = raw.replace(/\D/g, '');
    if (!value) return setAt(i, '');
    // paste-to-fill: distribute across the remaining cells
    if (value.length > 1) {
      const next = [...digits];
      for (let k = 0; k < value.length && i + k < LENGTH; k++) next[i + k] = value[k];
      setDigits(next);
      focus(i + value.length);
      return;
    }
    setAt(i, value);
    focus(i + 1);
  };

  const onKeyDown = (i: number, key: string) => {
    if (key === 'Backspace' && !digits[i] && i > 0) focus(i - 1);
    if (key === 'ArrowLeft') focus(i - 1);
    if (key === 'ArrowRight') focus(i + 1);
  };

  return { digits, focused, setFocused, refs, onChange, onKeyDown };
}

export function CodeInputShowcase() {
  const { digits, focused, setFocused, refs, onChange, onKeyDown } = useCodeInput();
  return (
    <Preview>
      <div style={{ display: 'flex', gap: 8 }}>
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={i === 0 ? LENGTH : 1}
            value={digit}
            aria-label={`Digit ${i + 1}`}
            onChange={(e) => onChange(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e.key)}
            onFocus={() => setFocused(i)}
            onBlur={() => setFocused(null)}
            style={cell(Boolean(digit), focused === i)}
          />
        ))}
      </div>
    </Preview>
  );
}
