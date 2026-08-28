'use client';

import { Check, ChevronsUpDown, Search, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { PhoneFrame } from '@/components/showcase/phone-frame';
import { Preview } from '@/components/showcase/preview';

const TAGS = [
  'design',
  'engineering',
  'product',
  'research',
  'writing',
  'reading',
  'finance',
  'health',
  'travel',
  'ideas',
];

const PLACEHOLDER = 'Select a tag…';
const FD_FOREGROUND = 'var(--color-fd-foreground)';

const triggerStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  height: 32,
  padding: '0 10px',
  minWidth: 200,
  borderRadius: 6,
  border: '1px solid var(--color-fd-border)',
  background: 'var(--color-fd-background)',
  color: FD_FOREGROUND,
  fontSize: 13,
  fontFamily: 'inherit',
  cursor: 'pointer',
};

const baseInputStyle: React.CSSProperties = {
  width: '100%',
  height: 32,
  padding: '0 10px 0 30px',
  borderRadius: 6,
  border: '1px solid var(--color-fd-border)',
  background: 'var(--color-fd-background)',
  color: FD_FOREGROUND,
  fontSize: 13,
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
};

const rowStyle = (highlighted: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '7px 10px',
  fontSize: 13,
  cursor: 'pointer',
  borderRadius: 5,
  color: FD_FOREGROUND,
  background: highlighted ? 'var(--color-fd-accent)' : 'transparent',
});

const searchIconStyle: React.CSSProperties = {
  position: 'absolute',
  left: 9,
  top: '50%',
  transform: 'translateY(-50%)',
  color: 'var(--color-fd-muted-foreground)',
  pointerEvents: 'none',
};

function filterTags(query: string) {
  return TAGS.filter((tag) => tag.includes(query.toLowerCase()));
}

function makeSelectHandler(
  setSelected: (value: string) => void,
  setOpen: (value: boolean) => void,
  setQuery: (value: string) => void,
) {
  return (value: string) => {
    setSelected(value);
    setOpen(false);
    setQuery('');
  };
}

function TriggerLabel({ selected }: { selected: string | null }) {
  return (
    <span
      style={{
        color: selected ? FD_FOREGROUND : 'var(--color-fd-muted-foreground)',
      }}
    >
      {selected ?? PLACEHOLDER}
    </span>
  );
}

function SearchInput({
  query,
  inputStyle,
  onChange,
}: {
  query: string;
  inputStyle: React.CSSProperties;
  onChange: (value: string) => void;
}) {
  return (
    <div style={{ position: 'relative', marginBottom: 4 }}>
      <Search size={14} strokeWidth={1.75} style={searchIconStyle} />
      <input
        autoFocus
        placeholder="Search tags…"
        style={inputStyle}
        value={query}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function OptionList({
  options,
  selected,
  onSelect,
}: {
  options: string[];
  selected: string | null;
  onSelect: (value: string) => void;
}) {
  if (options.length === 0) {
    return (
      <div
        style={{ padding: '8px 10px', fontSize: 13, color: 'var(--color-fd-muted-foreground)' }}
      >
        No results
      </div>
    );
  }
  return (
    <>
      {options.map((option) => (
        <div key={option} style={rowStyle(option === selected)} onClick={() => onSelect(option)}>
          {option}
          {option === selected ? <Check size={14} strokeWidth={1.75} /> : null}
        </div>
      ))}
    </>
  );
}

function DesktopPopover({
  options,
  selected,
  onSelect,
  query,
  onQueryChange,
}: {
  options: string[];
  selected: string | null;
  onSelect: (value: string) => void;
  query: string;
  onQueryChange: (value: string) => void;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 36,
        left: 0,
        minWidth: 200,
        padding: 4,
        background: 'var(--color-fd-popover)',
        border: '1px solid var(--color-fd-border)',
        borderRadius: 8,
        boxShadow: '0px 4px 24px rgba(0,0,0,0.2)',
        zIndex: 20,
      }}
    >
      <SearchInput query={query} inputStyle={baseInputStyle} onChange={onQueryChange} />
      <OptionList options={options} selected={selected} onSelect={onSelect} />
    </div>
  );
}

export function ComboboxShowcase() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = filterTags(query);
  const handleSelect = makeSelectHandler(setSelected, setOpen, setQuery);

  function handleClear(event: React.MouseEvent) {
    event.stopPropagation();
    setSelected(null);
    setQuery('');
  }

  return (
    <Preview>
      <div ref={containerRef} style={{ position: 'relative' }}>
        <button type="button" style={triggerStyle} onClick={() => setOpen((current) => !current)}>
          <TriggerLabel selected={selected} />
          {selected ? (
            <X size={14} strokeWidth={1.75} style={{ opacity: 0.5 }} onClick={handleClear} />
          ) : (
            <ChevronsUpDown size={14} strokeWidth={1.75} style={{ opacity: 0.5 }} />
          )}
        </button>
        {open ? (
          <DesktopPopover
            options={filtered}
            selected={selected}
            onSelect={handleSelect}
            query={query}
            onQueryChange={setQuery}
          />
        ) : null}
      </div>
    </Preview>
  );
}

const mobileInputStyle: React.CSSProperties = {
  ...baseInputStyle,
  height: 40,
  borderRadius: 8,
  fontSize: 14,
  paddingLeft: 32,
};

function MobileRow({
  option,
  selected,
  onSelect,
}: {
  option: string;
  selected: string | null;
  onSelect: (value: string) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px',
        height: 44,
        fontSize: 14,
        cursor: 'pointer',
        color: FD_FOREGROUND,
        background: option === selected ? 'var(--color-fd-accent)' : 'transparent',
        borderRadius: 8,
      }}
      onClick={() => onSelect(option)}
    >
      {option}
      {option === selected ? <Check size={16} strokeWidth={1.75} /> : null}
    </div>
  );
}

function MobileSheetHandle() {
  return (
    <div
      aria-hidden
      style={{
        width: 36,
        height: 4,
        borderRadius: 9999,
        background: 'var(--color-fd-border)',
        margin: '0 auto 12px',
        flexShrink: 0,
      }}
    />
  );
}

function MobileSheetSearch({
  query,
  onQueryChange,
}: {
  query: string;
  onQueryChange: (value: string) => void;
}) {
  return (
    <div style={{ position: 'relative', marginBottom: 8, flexShrink: 0 }}>
      <Search
        size={15}
        strokeWidth={1.75}
        style={{ ...searchIconStyle, left: 10 }}
      />
      <input
        placeholder="Search tags…"
        style={mobileInputStyle}
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
      />
    </div>
  );
}

function MobileSheetList({
  options,
  selected,
  onSelect,
}: {
  options: string[];
  selected: string | null;
  onSelect: (value: string) => void;
}) {
  if (options.length === 0) {
    return (
      <div
        style={{ padding: '12px', fontSize: 14, color: 'var(--color-fd-muted-foreground)' }}
      >
        No results
      </div>
    );
  }
  return (
    <>
      {options.map((option) => (
        <MobileRow key={option} option={option} selected={selected} onSelect={onSelect} />
      ))}
    </>
  );
}

function MobileSheet({
  options,
  selected,
  query,
  onQueryChange,
  onSelect,
  onClose,
}: {
  options: string[];
  selected: string | null;
  query: string;
  onQueryChange: (value: string) => void;
  onSelect: (value: string) => void;
  onClose: () => void;
}) {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 10 }}>
      <div
        onClick={onClose}
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
          padding: '10px 12px 24px',
          boxShadow: '0px -7px 32px rgba(0,0,0,0.28)',
          maxHeight: '70%',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <MobileSheetHandle />
        <MobileSheetSearch query={query} onQueryChange={onQueryChange} />
        <div style={{ overflowY: 'auto' }}>
          <MobileSheetList options={options} selected={selected} onSelect={onSelect} />
        </div>
      </div>
    </div>
  );
}

export function ComboboxMobileShowcase() {
  const [open, setOpen] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const filtered = filterTags(query);
  const handleSelect = makeSelectHandler(setSelected, setOpen, setQuery);

  return (
    <Preview>
      <PhoneFrame label="Combobox · mobile">
        <div style={{ padding: '32px 16px 16px' }}>
          <div style={{ fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 12 }}>
            Add tag
          </div>
          <button
            type="button"
            style={{ ...triggerStyle, width: '100%' }}
            onClick={() => setOpen(true)}
          >
            <TriggerLabel selected={selected} />
            <ChevronsUpDown size={14} strokeWidth={1.75} style={{ opacity: 0.5 }} />
          </button>
        </div>
        {open ? (
          <MobileSheet
            options={filtered}
            selected={selected}
            query={query}
            onQueryChange={setQuery}
            onSelect={handleSelect}
            onClose={() => setOpen(false)}
          />
        ) : null}
      </PhoneFrame>
    </Preview>
  );
}
