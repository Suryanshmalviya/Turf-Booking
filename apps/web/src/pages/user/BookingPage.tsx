import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { BookingForm } from '../../components/booking/BookingForm';
import { Container, PageShell } from '../../components/common/Container';
import { BackLink } from '../../components/common/Feedback';
import { CourtAvailability } from '../../components/court/CourtAvailability';
import { ErrorState } from '../../components/ui/ErrorState';
import { Loading } from '../../components/ui/Loading';
import { useVenueDetail } from '../../hooks/useCourts';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { ROUTES } from '../../routes/paths';
import { useBookingDraftStore } from '../../store/bookingDraft.store';
import type { AvailabilityInterval } from '../../types/booking';
import { todayIso } from '../../utils/format';
import type { BookingRequestFormValues } from '../../utils/validation';

const INITIAL_VALUES: BookingRequestFormValues = { pitchId: '', date: todayIso(), durationMinutes: 60 };

/** Pick a court and slot. Selecting a slot stores the draft and moves to checkout. */
export function BookingPage() {
  useDocumentTitle('Choose a slot');
  const { venueId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [values, setValues] = useState<BookingRequestFormValues>({
    ...INITIAL_VALUES,
    pitchId: searchParams.get('pitch') ?? '',
  });
  const [searched, setSearched] = useState<BookingRequestFormValues | null>(null);

  const setDraft = useBookingDraftStore(state => state.setDraft);
  const venue = useVenueDetail(venueId);

  // Default to the first court so the customer does not have to choose one
  // before they can search.
  useEffect(() => {
    const firstPitchId = venue.data?.pitches[0]?._id;
    if (!firstPitchId || values.pitchId) return;
    setValues(current => ({ ...current, pitchId: firstPitchId }));
  }, [values.pitchId, venue.data?.pitches]);

  const runSearch = (next: BookingRequestFormValues) => {
    setValues(next);
    setSearched(next);
  };

  const handleSelect = (interval: AvailabilityInterval) => {
    if (!searched) return;
    setDraft({
      venueId,
      venueName: venue.data?.venue.name,
      pitchId: searched.pitchId,
      pitchName: venue.data?.pitches.find(pitch => pitch._id === searched.pitchId)?.name,
      date: searched.date,
      durationMinutes: searched.durationMinutes,
      interval,
    });
    navigate(ROUTES.checkout);
  };

  return (
    <PageShell>
      <Container>
        <BackLink to={ROUTES.venueDetail(venueId)}>Venue details</BackLink>

        {venue.isLoading && <Loading message="Loading this venue…" />}

        {venue.isError && (
          <ErrorState
            className="mt-8"
            message={venue.error instanceof Error ? venue.error.message : undefined}
            onRetry={() => void venue.refetch()}
          />
        )}

        {venue.data && (
          <div className="mt-5 grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="card h-fit p-6">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary-700">Choose a slot</p>
              <h1 className="mt-2 text-3xl font-bold text-slate-950">{venue.data.venue.name}</h1>

              <div className="mt-6">
                <BookingForm
                  pitches={venue.data.pitches}
                  values={values}
                  onChange={setValues}
                  onSearch={runSearch}
                  isSearching={searched !== null && venue.isFetching}
                  minDate={todayIso()}
                />
              </div>
            </div>

            <div>
              <h2 className="text-2xl font-semibold text-slate-950">Available times</h2>
              {searched ? (
                <div className="mt-5">
                  <CourtAvailability
                    query={{
                      venueId,
                      pitchId: searched.pitchId,
                      date: searched.date,
                      durationMinutes: searched.durationMinutes,
                    }}
                    enabled
                    onSelect={handleSelect}
                  />
                </div>
              ) : (
                <div className="card mt-5 p-8">
                  <h3 className="font-semibold text-slate-950">No times loaded</h3>
                  <p className="mt-2 text-gray-600">
                    Choose a court and date, then check live availability.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </Container>
    </PageShell>
  );
}