import type { ReactNode } from 'react';

import { Button } from './Button';

export interface ErrorStateProps {
  title?: string;
  /** Defaults to the message carried by the thrown error. */
  message?: string;
  /** Optional retry handler. The button is omitted when absent. */
  onRetry?: () => void;
  retryLabel?: string;
  action?: ReactNode;
  className?: string;
}

/** Terminal failure state for a section that could not load its data. */
export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Try again',
  action,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={`rounded-lg border border-red-200 bg-red-50 p-6 text-center ${className ?? ''}`.trim()}
    >
      <h2 className="text-lg font-semibold text-red-900">{title}</h2>
      {message && <p className="mt-2 text-sm text-red-700">{message}</p>}
      {(onRetry || action) && (
        <div className="mt-5 flex justify-center gap-3">
          {onRetry && (
            <Button variant="secondary" onClick={onRetry}>
              {retryLabel}
            </Button>
          )}
          {action}
        </div>
      )}
    </div>
  );
}
