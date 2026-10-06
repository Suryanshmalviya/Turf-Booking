import type { ReactNode } from 'react';

import type { ButtonVariant } from '../../types/ui';
import { Button } from './Button';
import { Modal } from './Modal';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: ButtonVariant;
  loading?: boolean;
}

/**
 * Confirmation dialog layered on `Modal` so destructive and informational
 * prompts share one overlay, focus trap and escape handling.
 */
export function Dialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmVariant = 'primary',
  loading = false,
}: DialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      closeOnOverlayClick={!loading}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={confirmVariant} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Modal>
  );
}