import { useParams } from 'react-router-dom';

import { Container, PageShell, Section } from '../../components/common/Container';
import { BackLink } from '../../components/common/Feedback';
import { PitchCard } from '../../components/court/CourtCard';
import { CourtSchedule } from '../../components/court/CourtSchedule';
import { ErrorState } from '../../components/ui/ErrorState';
import { Loading } from '../../components/ui/Loading';
import { useVenueDetail, useVenueSchedule } from '../../hooks/useCourts';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { ROUTES } from '../../routes/paths';

/** Venue profile: description, courts and opening hours. */
export function VenueDetailPage() {
  const { venueId = '' } = useParams();
  const detail = useVenueDetail(venueId);
  const schedule = useVenueSchedule(venueId);

  useDocumentTitle(detail.data?.venue.name);

  return (
    <PageShell>
      <Container>
        <BackLink to={ROUTES.venues}>All venues</BackLink>

        {detail.isLoading && <Loading message="Loading venue details…" />}

        {detail.isError && (
          <ErrorState
            className="mt-8"
            message={detail.error instanceof Error ? detail.error.message : undefined}
            onRetry={() => void detail.refetch()}
          />
        )}

        {detail.data && (
          <>
            <div className="mt-5 flex h-72 items-end rounded-2xl bg-gradient-to-br from-emerald-200 via-teal-100 to-orange-100 p-8">
              <div>
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-900">
                  {detail.data.venue.timezone}
                </span>
                <h1 className="mt-2 text-4xl font-bold text-slate-950">{detail.data.venue.name}</h1>
              </div>
            </div>

            <div className="mt-8">
              <h2 className="text-2xl font-semibold text-slate-950">The facility</h2>
              <p className="mt-3 text-gray-600">
                {detail.data.venue.description ?? 'A published pickleball facility.'}
              </p>
              <p className="mt-3 text-gray-600">
                {detail.data.venue.address.line1}, {detail.data.venue.address.city},{' '}
                {detail.data.venue.address.region} {detail.data.venue.address.postalCode}
              </p>
            </div>

            <div className="mt-8 grid gap-8 lg:grid-cols-[1.4fr_0.8fr]">
              <Section title="Choose a court">
                {detail.data.pitches.length === 0 ? (
                  <p className="text-gray-600">No courts have been published for this venue yet.</p>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {detail.data.pitches.map(pitch => (
                      <PitchCard key={pitch._id} pitch={pitch} venueId={venueId} />
                    ))}
                  </div>
                )}
              </Section>

              <CourtSchedule schedule={schedule.data} />
            </div>
          </>
        )}
      </Container>
    </PageShell>
  );
}