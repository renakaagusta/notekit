import type { ReactNode } from 'react';
import { Button } from '@/components/showcase/button';
import { Preview } from '@/components/showcase/preview';

function MiniDialog({ title, body, footer }: { title: string; body: string; footer: ReactNode }) {
  return (
    <div
      style={{
        width: 260,
        background: 'var(--color-fd-popover)',
        color: 'var(--color-fd-popover-foreground)',
        border: '1px solid var(--color-fd-border)',
        borderRadius: 8,
        boxShadow: '0px 7px 32px rgba(0,0,0,0.35)',
        padding: 16,
      }}
    >
      <strong style={{ fontSize: 14 }}>{title}</strong>
      <p style={{ fontSize: 12.5, color: 'var(--color-fd-muted-foreground)', margin: '6px 0 16px' }}>
        {body}
      </p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>{footer}</div>
    </div>
  );
}

export function DialogButtonsShowcase() {
  return (
    <Preview>
      <MiniDialog
        title="You're all set"
        body="Your device is paired and syncing."
        footer={<Button variant="primary">Got it</Button>}
      />
      <MiniDialog
        title="Pair this device?"
        body="It will be able to read notes shared to it."
        footer={
          <>
            <Button variant="secondary">Cancel</Button>
            <Button variant="primary">Pair</Button>
          </>
        }
      />
      <MiniDialog
        title="Delete this vault?"
        body="This removes the vault and its keys from this device."
        footer={
          <>
            <Button variant="secondary">Cancel</Button>
            <Button variant="destructive">Delete</Button>
          </>
        }
      />
    </Preview>
  );
}
