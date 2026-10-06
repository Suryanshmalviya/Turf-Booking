import { useEffect, useState } from 'react';

import type { ButtonVariant } from '../../types/ui';
import { cn } from '../../utils/cn';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Textarea } from '../ui/Textarea';

export interface ConfirmActionDialogProps {
  open: boolean;
  title: string;
  /** What will happen, in plain words, before the admin commits. */
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: ButtonVariant;
  /**
   * When set, a reason must be entered before confirming. Administrative
   * actions are audited server-side, so the reason becomes part of the record.
   */
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  /** Pre-fills the box, e.g. when the same action repeats on several rows. */
  initialReason?: string;
  isPending?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  children?: React.ReactNode;
  className?: string;
}

/**
 * One confirmation surface for every destructive or audited admin action.
 *
 * The dialog owns the reason field and its validation so individual pages do not
 * each re-implement "confirm, justify, submit". It also blocks overlay and
 * Escape dismissal while a request is in flight, which is what prevents a
 * double-submit from writing two audit entries.
 */
export function ConfirmActionDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmVariant = 'primary',
  requireReason = false,
  reasonLabel = 'Reason',
  reasonPlaceholder = 'Why is this decision being made?',
  initialReason = '',
  isPending = false,
  error,
  onClose,
  onConfirm,
  children,
  className,
}: ConfirmActionDialogProps) {
  const [reason, setReason] = useState(initialReason);
  const [touched, setTouched] = useState(false);

  // Reset per open so a previous reason is never submitted to a new action.
  useEffect(() => {
    if (open) {
      setReason(initialReason);
      setTouched(false);
    }
  }, [open, initialReason]);

  const trimmed = reason.trim();
  const tooShort = requireReason && trimmed.length < 3;
  const reasonError = touched && tooShort ? 'Enter at least 3 characters.' : undefined;
  const canConfirm = !isPending && !tooShort;

  const confirm = () => {
    setTouched(true);
    if (tooShort) return;
    onConfirm(trimmed);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      {...(description ? { description: typeof description === 'string' ? description : undefined } : {})}
      size="md"
      closeOnOverlayClick={!isPending}
      className={cn(className)}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            {cancelLabel}
          </Button>
          <Button variant={confirmVariant} onClick={confirm} loading={isPending} disabled={!canConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {typeof description === 'string' ? null : description}

      {children}

      {requireReason && (
        <Textarea
          label={reasonLabel}
          rows={3}
          maxLength={1000}
          className="mt-4"
          placeholder={reasonPlaceholder}
          value={reason}
          error={reasonError}
          hint="Recorded in the audit log against this action."
          onChange={event => setReason(event.target.value)}
          onBlur={() => setTouched(true)}
        />
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
    </Modal>
  );
}