import { Link } from 'react-router-dom';

import { Container,PageHeader, PageShell } from '../../components/common/Container';
import { CourtCard } from '../../components/court/CourtCard';
import { VenueSearchForm } from '../../components/forms/VenueSearchForm';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Loading } from '../../components/ui/Loading';
import { useVenues } from '../../hooks/useCourts';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { ROUTES } from '../../routes/paths';
import { toSearchParams, useVenueFilterStore } from '../../store/venueFilter.store';

/** Venue discovery: filters plus a responsive grid of published courts. */
export function VenueSearchPage() {
  useDocumentTitle('Find a court');

  const filters = useVenueFilterStore(state => state.filters);
  const debouncedFilters = useDebouncedValue(filters, 250);
  const searchParams = toSearchParams(debouncedFilters);
  const venues = useVenues(searchParams);

  return (
    <PageShell>
      <Container>
        <PageHeader
          eyebrow="Find your next game"
          title="Courts worth showing up for"
          description="Browse published venues, compare facilities, and check local opening hours."
        />

        <div className="mt-10 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <VenueSearchForm />
        </div>

        <div className="mt-10">
          {venues.isLoading && <Loading message="Loading published venues…" />}

          {venues.isError && (
            <ErrorState
              message={venues.error instanceof Error ? venues.error.message : undefined}
              onRetry={() => void venues.refetch()}
            />
          )}

          {venues.data && venues.data.items.length === 0 && (
            <EmptyState
              title="No venues found"
              description="Try a wider search or check back as new facilities are reviewed."
              action={
                <Link to={ROUTES.venues} className="btn-secondary">
                  Clear filters
                </Link>
              }
            />
          )}

          {venues.data && venues.data.items.length > 0 && (
            <>
              <p className="mb-4 text-sm text-gray-600" aria-live="polite">
                {venues.data.total} {venues.data.total === 1 ? 'venue' : 'venues'} available
              </p>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {venues.data.items.map(venue => (
                  <CourtCard
                    key={venue._id}
                    venueId={venue._id}
                    name={venue.name}
                    description={venue.description}
                    statusLabel={venue.status === 'active' ? 'Published venue' : venue.status}
                    meta={`${venue.address.city}, ${venue.address.region} · ${venue.timezone}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </Container>
    </PageShell>
  );
}