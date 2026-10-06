import { Fragment } from 'react';

import { cn } from '../../utils/cn';

export interface StepperStep {
  id: string;
  label: string;
  /** Index of the step the customer is currently on. */
  state: 'complete' | 'current' | 'upcoming';
}

export interface StepperProps {
  steps: Array<Omit<StepperStep, 'state'> & { state?: StepperStep['state'] }>;
  currentIndex: number;
  className?: string;
  /** Visible label under the progress bar, e.g. "Step 2 of 5". */
  ariaLabel?: string;
}

/**
 * Horizontal progress indicator for the booking flow. The active step is
 * marked with `aria-current="step"`; completed steps are announced as such so
 * screen-reader users get the same orientation as sighted users.
 */
export function Stepper({ steps, currentIndex, className, ariaLabel }: StepperProps) {
  const resolved = steps.map((step, index) => ({
    ...step,
    state: step.state ?? (index < currentIndex ? 'complete' : index === currentIndex ? 'current' : 'upcoming'),
  }));
  const percent = Math.round(((currentIndex + 1) / resolved.length) * 100);

  return (
    <nav aria-label={ariaLabel ?? 'Booking progress'} className={cn('w-full', className)}>
      <div
        className="h-1 w-full overflow-hidden rounded-full bg-gray-200"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={resolved.length}
        aria-valuenow={currentIndex + 1}
        aria-valuetext={`Step ${currentIndex + 1} of ${resolved.length}: ${resolved[currentIndex]?.label ?? ''}`}
      >
        <div className="h-full rounded-full bg-primary-600 transition-all" style={{ width: `${percent}%` }} />
      </div>

      <ol className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {resolved.map(step => (
          <li
            key={step.id}
            aria-current={step.state === 'current' ? 'step' : undefined}
            className={cn(
              'flex items-center gap-1.5 text-xs font-medium',
              step.state === 'current' && 'text-primary-700',
              step.state === 'complete' && 'text-gray-500',
              step.state === 'upcoming' && 'text-gray-400'
            )}
          >
            {step.state === 'complete' ? (
              <CheckIcon />
            ) : (
              <Fragment>
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex h-4 w-4 items-center justify-center rounded-full border text-[10px]',
                    step.state === 'current'
                      ? 'border-primary-600 bg-primary-600 text-white'
                      : 'border-gray-300 text-gray-500'
                  )}
                >
                  {step.id}
                </span>
                {step.label}
              </Fragment>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function CheckIcon() {
  return (
    <svg className="h-4 w-4 text-primary-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}