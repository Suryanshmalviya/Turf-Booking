import { Link } from 'react-router-dom';

import { ROUTES } from '../../routes/paths';
import type { Pitch } from '../../types/court';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';

export interface CourtCardProps {
  venueId: string;
  name: string;
  description?: string;
  /** Rendered as a badge on the media placeholder, e.g. "Published venue". */
  statusLabel?: string;
  meta?: string;
  to?: string;
  actionLabel?: string;
}

/** Summary card for a single court inside a venue. */
export function PitchCard({
  pitch,
  venueId,
  actionLabel = 'Choose a time',
}: {
  pitch: Pitch;
  venueId: string;
  actionLabel?: string;
}) {
  return (
    <Card className="flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold text-slate-950">{pitch.name}</h3>
        <Badge tone={pitch.indoor ? 'info' : 'success'}>{pitch.indoor ? 'Indoor' : 'Outdoor'}</Badge>
      </div>
      {pitch.surface && <p className="mt-1 text-sm text-gray-500">{pitch.surface}</p>}
      {pitch.description && <p className="mt-3 flex-1 text-sm text-gray-600">{pitch.description}</p>}
      <Link
        to={ROUTES.venueBooking(venueId, pitch._id)}
        className="btn-outline mt-4 self-start text-xs"
      >
        {actionLabel}
      </Link>
    </Card>
  );
}

/** Venue-level card used on the search page. */
export function CourtCard({
  venueId,
  name,
  description,
  statusLabel = 'Published venue',
  meta,
  to = ROUTES.venueDetail(venueId),
}: CourtCardProps) {
  return (
    <Link to={to} className="card group transition hover:-translate-y-1 hover:shadow-md">
      <div className="flex h-44 items-end bg-gradient-to-br from-emerald-100 via-teal-50 to-orange-50 p-5">
        <Badge tone="success">{statusLabel}</Badge>
      </div>
      <div className="p-5">
        <h2 className="text-xl font-semibold text-slate-950 group-hover:text-primary-700">{name}</h2>
        {meta && <p className="mt-2 text-sm text-gray-500">{meta}</p>}
        <p className="mt-4 text-gray-600">{description ?? 'A ready-to-play pickleball venue.'}</p>
      </div>
    </Link>
  );
}