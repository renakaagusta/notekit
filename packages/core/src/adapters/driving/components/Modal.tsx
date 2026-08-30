import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { MOBILE_BREAKPOINT, useMediaQuery } from "../hooks/useMediaQuery";

// ── Focus trap ────────────────────────────────────────────────────────────────

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
    ),
  );
}

function useFocusTrap(
  panelRef: React.RefObject<HTMLElement | null>,
  open: boolean,
) {
  const previousFocusRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement;
    panelRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = getFocusable(panelRef.current);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        }
      } else {
        if (document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (previousFocusRef.current instanceof HTMLElement) {
        previousFocusRef.current.focus();
      }
    };
  }, [open, panelRef]);
}

// ── Escape key ────────────────────────────────────────────────────────────────

function useEscapeKey(handler: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") handler();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [handler, active]);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Overlay({
  isDismissable,
  onClose,
}: {
  isDismissable: boolean;
  onClose: () => void;
}) {
  return (
    <div
      className="nk-dialog-backdrop"
      aria-hidden="true"
      onClick={isDismissable ? onClose : undefined}
    />
  );
}

function SheetHandle() {
  return <div className="nk-dialog__handle" aria-hidden="true" />;
}

function DialogCloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      className="nk-dialog__close nk-btn"
      type="button"
      aria-label="Close dialog"
      onClick={onClose}
    >
      <X size={14} />
    </button>
  );
}

// ── Modal (shell) ─────────────────────────────────────────────────────────────

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  isDismissable?: boolean;
  labelledBy?: string;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  isDismissable = true,
  labelledBy,
}: ModalProps) {
  const isMobile = useMediaQuery(MOBILE_BREAKPOINT);
  const generatedTitleId = useId();
  const titleId = labelledBy ?? generatedTitleId;
  const panelRef = useRef<HTMLDivElement>(null);

  useFocusTrap(panelRef, open);
  useEscapeKey(onClose, open && isDismissable);

  if (!open) return null;

  const sheetClass = isMobile ? " nk-dialog--sheet" : "";

  return (
    <div className="nk-dialog-root">
      <Overlay isDismissable={isDismissable} onClose={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`nk-dialog${sheetClass}`}
        tabIndex={-1}
      >
        {isMobile && <SheetHandle />}
        <div className="nk-dialog__title-row">
          <h2 id={titleId} className="nk-dialog__title">
            {title}
          </h2>
          {isDismissable && <DialogCloseButton onClose={onClose} />}
        </div>
        {children}
      </div>
    </div>
  );
}

// ── ConfirmDialog ─────────────────────────────────────────────────────────────

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string | null;
  onConfirm: () => void;
  destructive?: boolean;
  busy?: boolean;
}

function ConfirmFooter({
  confirmLabel,
  cancelLabel,
  onClose,
  onConfirm,
  destructive,
  busy,
}: {
  confirmLabel: string;
  cancelLabel: string | null | undefined;
  onClose: () => void;
  onConfirm: () => void;
  destructive?: boolean;
  busy?: boolean;
}) {
  const primaryClass = destructive
    ? "nk-btn nk-btn--danger"
    : "nk-btn nk-btn--primary";

  return (
    <div className="nk-dialog__footer nk-dialog__footer--confirm">
      {cancelLabel !== null && (
        <button
          type="button"
          className="nk-btn"
          onClick={onClose}
          disabled={busy}
        >
          {cancelLabel ?? "Cancel"}
        </button>
      )}
      <button
        type="button"
        className={primaryClass}
        onClick={onConfirm}
        disabled={busy}
      >
        {confirmLabel}
      </button>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  destructive,
  busy,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      isDismissable={!busy}
    >
      {description && (
        <p className="nk-dialog__description">{description}</p>
      )}
      <ConfirmFooter
        confirmLabel={confirmLabel}
        cancelLabel={cancelLabel}
        onClose={onClose}
        onConfirm={onConfirm}
        destructive={destructive}
        busy={busy}
      />
    </Modal>
  );
}

// ── DialogForm ────────────────────────────────────────────────────────────────

export interface DialogFormProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  submitLabel: string;
  onSubmit: () => void;
  busy?: boolean;
  cancelLabel?: string;
}

function DialogFormFooter({
  submitLabel,
  cancelLabel,
  onClose,
  onSubmit,
  busy,
}: {
  submitLabel: string;
  cancelLabel: string | undefined;
  onClose: () => void;
  onSubmit: () => void;
  busy?: boolean;
}) {
  return (
    <div className="nk-dialog__footer">
      <button
        type="button"
        className="nk-btn"
        onClick={onClose}
        disabled={busy}
      >
        {cancelLabel ?? "Cancel"}
      </button>
      <button
        type="button"
        className="nk-btn nk-btn--primary"
        onClick={onSubmit}
        disabled={busy}
      >
        {submitLabel}
      </button>
    </div>
  );
}

export function DialogForm({
  open,
  onClose,
  title,
  children,
  submitLabel,
  onSubmit,
  busy,
  cancelLabel,
}: DialogFormProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} isDismissable={!busy}>
      <div className="nk-dialog__body">{children}</div>
      <DialogFormFooter
        submitLabel={submitLabel}
        cancelLabel={cancelLabel}
        onClose={onClose}
        onSubmit={onSubmit}
        busy={busy}
      />
    </Modal>
  );
}
