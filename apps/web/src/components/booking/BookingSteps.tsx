import { Stepper } from '../ui/Stepper';

export const BOOKING_FLOW_STEPS = [
  { id: '1', label: 'Search' },
  { id: '2', label: 'Court' },
  { id: '3', label: 'Date' },
  { id: '4', label: 'Slot' },
  { id: '5', label: 'Summary' },
  { id: '6', label: 'Payment' },
  { id: '7', label: 'Confirmation' },
  { id: '8', label: 'Details' },
] as const;

export interface BookingStepsProps {
  /** Zero-based index into `BOOKING_FLOW_STEPS`. */
  current: number;
  className?: string;
}

/** Progress indicator for the customer booking journey. */
export function BookingSteps({ current, className }: BookingStepsProps) {
  return <Stepper steps={[...BOOKING_FLOW_STEPS]} currentIndex={current} className={className} />;
}