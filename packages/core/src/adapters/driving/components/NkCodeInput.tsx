import { useRef } from "react";

/**
 * Segmented fixed-length code input (device pairing / one-time codes): one box
 * per digit, auto-advance on type, backspace steps back, and paste fills every
 * box. Numeric-only. Controlled: `value` is the joined string, `onChange` gets
 * the sanitized joined string capped at `length`.
 */
export function NkCodeInput({
  value,
  onChange,
  length = 6,
  disabled,
  autoFocus,
  onComplete,
}: {
  value: string;
  onChange: (code: string) => void;
  length?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  onComplete?: (code: string) => void;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  const focus = (i: number) =>
    refs.current[Math.max(0, Math.min(length - 1, i))]?.focus();

  const commit = (next: string) => {
    const sanitized = next.replace(/\D/g, "").slice(0, length);
    onChange(sanitized);
    if (sanitized.length === length) onComplete?.(sanitized);
  };

  const handleChange = (index: number, raw: string) => {
    const clean = raw.replace(/\D/g, "");
    if (!clean) {
      commit(digits.map((d, i) => (i === index ? "" : d)).join(""));
      return;
    }
    if (clean.length > 1) {
      // paste-to-fill from this cell onward
      const merged = digits.slice(0, index).join("") + clean;
      commit(merged);
      focus(index + clean.length);
      return;
    }
    const next = digits.map((d, i) => (i === index ? clean : d)).join("");
    commit(next);
    focus(index + 1);
  };

  const handleKeyDown = (index: number, key: string) => {
    if (key === "Backspace" && !digits[index] && index > 0) focus(index - 1);
    else if (key === "ArrowLeft") focus(index - 1);
    else if (key === "ArrowRight") focus(index + 1);
  };

  return (
    <div className="nk-code-input" role="group" aria-label={`${length}-digit code`}>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            refs.current[index] = el;
          }}
          className="nk-code-input__cell"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={index === 0 ? length : 1}
          value={digit}
          disabled={disabled}
          autoFocus={autoFocus && index === 0}
          aria-label={`Digit ${index + 1}`}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e.key)}
        />
      ))}
    </div>
  );
}
