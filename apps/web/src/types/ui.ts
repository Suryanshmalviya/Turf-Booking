/** Shared presentation primitives consumed by the `ui` component layer. */

import type { ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';

export type ButtonSize = 'sm' | 'md' | 'lg';

export type TableColumn<TRow> = {
  key: string;
  header: string;
  render: (row: TRow, index: number) => ReactNode;
  className?: string;
};

export type ToastVariant = 'info' | 'success' | 'warning' | 'danger';