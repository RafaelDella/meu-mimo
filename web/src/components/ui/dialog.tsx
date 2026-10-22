'use client';

import { useEffect, useId, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { Button } from './button';

export type DialogProps = {
  open: boolean;
  onOpenChange(open: boolean): void;
  title: string;
  description?: string;
  children: ReactNode;
  returnFocusRef: RefObject<HTMLElement | null>;
};

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  returnFocusRef,
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;

    const trigger = returnFocusRef.current;
    dialog.showModal();

    return () => {
      dialog.close();
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [open, returnFocusRef]);

  return (
    <dialog
      ref={dialogRef}
      className="ui-dialog"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={event => {
        event.preventDefault();
        onOpenChange(false);
      }}
      onClose={() => {
        // O evento pode chegar depois do próximo showModal, inclusive em StrictMode.
        if (!dialogRef.current?.open) onOpenChange(false);
      }}
      onKeyDown={event => {
        if (event.key !== 'Tab' || event.defaultPrevented) return;
        const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
          'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]',
        )).filter(element => !element.matches(':disabled') &&
          !element.closest('[inert]') && element.getClientRects().length > 0 &&
          getComputedStyle(element).visibility !== 'hidden');
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if ((event.shiftKey && document.activeElement === first) ||
            (!event.shiftKey && document.activeElement === last)) {
          event.preventDefault();
          (event.shiftKey ? last : first)?.focus();
        }
      }}
    >
      <div className="ui-dialog-header">
        <h2 id={titleId}>{title}</h2>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          Fechar
        </Button>
      </div>
      <div className="ui-dialog-content">
        {description && <p id={descriptionId}>{description}</p>}
        {children}
      </div>
    </dialog>
  );
}
