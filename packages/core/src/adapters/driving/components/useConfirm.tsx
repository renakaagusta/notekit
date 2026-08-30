import { useCallback, useRef, useState } from "react";
import { ConfirmDialog } from "./Modal";

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
}

interface PendingConfirm {
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
}

export interface UseConfirmResult {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  confirmDialog: React.ReactNode;
}

export function useConfirm(): UseConfirmResult {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setPending({ options, resolve });
    });
  }, []);

  function handleConfirm() {
    resolverRef.current?.(true);
    resolverRef.current = null;
    setPending(null);
  }

  function handleClose() {
    resolverRef.current?.(false);
    resolverRef.current = null;
    setPending(null);
  }

  const confirmDialog = pending ? (
    <ConfirmDialog
      open
      onClose={handleClose}
      title={pending.options.title}
      description={pending.options.description}
      confirmLabel={pending.options.confirmLabel}
      cancelLabel={pending.options.cancelLabel}
      onConfirm={handleConfirm}
      destructive={pending.options.destructive}
    />
  ) : null;

  return { confirm, confirmDialog };
}
