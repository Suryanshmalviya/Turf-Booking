import { type ReactNode,useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '../../utils/cn';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  /** Constrain the panel width. Dialogs default to `md`. */
  size?: 'sm' | 'md' | 'lg';
  /** Set to false for destructive confirmations that need an explicit choice. */
  closeOnOverlayClick?: boolean;
  className?: string;
}

const SIZE_CLASS = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
} as const;

/**
 * Overlay dialog rendered in a portal. Handles focus placement, the escape
 * key, body scroll locking and restoring focus to the trigger on close.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeOnOverlayClick = true,
  className,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return undefined;

    previouslyFocused.current = document.activeElement;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    panelRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
      if (previouslyFocused.current instanceof HTMLElement) previouslyFocused.current.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-gray-900/50"
        onClick={closeOnOverlayClick ? onClose : undefined}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          'relative w-full rounded-xl bg-white shadow-xl focus:outline-none',
          SIZE_CLASS[size],
          className
        )}
      >
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
          {description && <p className="mt-1 text-sm text-gray-600">{description}</p>}
        </div>
        {children && <div className="px-6 py-5">{children}</div>}
        {footer && (
          <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">{footer}</div>
        )}
      </div>
    </div>,
    document.body
  );
}