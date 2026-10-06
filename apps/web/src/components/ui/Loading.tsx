import { cn } from '../../utils/cn';

export interface SpinnerProps {
  className?: string;
}

/**
 * Decorative spinner. It inherits the surrounding text colour so it can sit
 * inside a `Button` without a second colour class, and it is hidden from
 * assistive technology so it never changes a control's accessible name — the
 * surrounding `Loading` region is the live region that announces progress.
 */
export function Spinner({ className }: SpinnerProps) {
  return (
    <svg
      className={cn('h-5 w-5 animate-spin', className)}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
    </svg>
  );
}

export interface LoadingProps {
  message?: string;
  /** Fill the viewport instead of sitting inline with other content. */
  fullHeight?: boolean;
  className?: string;
}

/** Inline pending indicator with an accessible live-region announcement. */
export function Loading({ message = 'Loading…', fullHeight, className }: LoadingProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex flex-col items-center justify-center gap-3 text-gray-600',
        fullHeight ? 'min-h-[50vh] py-16' : 'py-10',
        className
      )}
    >
      <Spinner className="text-primary-600" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

export interface SkeletonProps {
  className?: string;
}

/** Placeholder block used while a grid of results loads. */
export function Skeleton({ className }: SkeletonProps) {
  return <div className={cn('animate-pulse rounded-lg bg-gray-200', className)} />;
}