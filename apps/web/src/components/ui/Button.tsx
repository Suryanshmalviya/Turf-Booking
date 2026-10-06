import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from 'react';

import type { ButtonSize, ButtonVariant } from '../../types/ui';
import { cn } from '../../utils/cn';
import { Spinner } from './Loading';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'bg-primary-600 text-white hover:bg-primary-700 focus-visible:ring-primary-500',
  secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200 focus-visible:ring-gray-400',
  outline: 'border-2 border-primary-600 text-primary-700 hover:bg-primary-50 focus-visible:ring-primary-500',
  ghost: 'bg-transparent text-gray-700 hover:bg-gray-100 focus-visible:ring-gray-400',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500',
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-8 py-3 text-base',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Renders a spinner and disables the button while an action is in flight. */
  loading?: boolean;
  /** Stretch to the width of the parent. */
  block?: boolean;
  leadingIcon?: ReactNode;
}

/**
 * The single button used across the app. Always pass `type` explicitly at the
 * call site so a button inside a form never submits by accident.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    block = false,
    leadingIcon,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANT_CLASS[variant],
        SIZE_CLASS[size],
        block && 'w-full',
        className
      )}
      {...rest}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {leadingIcon}
      {children}
    </button>
  );
});