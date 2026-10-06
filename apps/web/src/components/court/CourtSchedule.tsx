import type { VenueSchedule } from '../../types/court';
import { WEEKDAY_LABELS } from '../../types/court';
import { formatMinute } from '../../utils/format';
import { Card, CardBody, CardHeader } from '../ui/Card';

export interface CourtScheduleProps {
  schedule: VenueSchedule | undefined;
}

/** Weekly opening hours plus any blackout or special-open dates. */
export function CourtSchedule({ schedule }: CourtScheduleProps) {
  return (
    <Card>
      <CardHeader title="Opening hours" />

      <CardBody className="space-y-3">
        {WEEKDAY_LABELS.map((day, index) => {
          const rules = (schedule?.rules ?? []).filter(rule => rule.dayOfWeek === index);
          return (
            <div key={day} className="flex items-center justify-between gap-4 text-sm">
              <span className="text-gray-600">{day}</span>
              <span className="text-right font-medium text-slate-900">
                {rules.length > 0
                  ? rules
                      .map(
                        rule => `${formatMinute(rule.startMinute)}–${formatMinute(rule.endMinute)}`
                      )
                      .join(', ')
                  : 'Closed'}
              </span>
            </div>
          );
        })}
      </CardBody>

      <div className="mt-6 border-t border-gray-100 pt-5">
        <h3 className="font-semibold text-slate-950">Special dates</h3>
        {schedule && schedule.exceptions.length > 0 ? (
          <ul className="mt-3 space-y-2 text-sm text-gray-600">
            {schedule.exceptions.map(exception => (
              <li key={exception._id}>
                {new Date(exception.date).toLocaleDateString()} ·{' '}
                {exception.kind === 'blackout'
                  ? 'Closed'
                  : `${formatMinute(exception.startMinute ?? 0)}–${formatMinute(exception.endMinute ?? 1440)}`}
                {exception.reason ? ` · ${exception.reason}` : ''}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-gray-500">No special dates listed.</p>
        )}
      </div>
    </Card>
  );
}
