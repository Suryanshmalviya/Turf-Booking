import { useState } from 'react';

import { ConfirmActionDialog } from '../../components/admin/ConfirmActionDialog';
import { DataTable } from '../../components/admin/DataTable';
import { FilterBar } from '../../components/admin/FilterBar';
import { Notice } from '../../components/common/Feedback';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useModerateReview, useReviews } from '../../hooks/useReviews';
import { useToast } from '../../hooks/useToast';
import type { Review, ReviewStatus } from '../../services/review.api';
import { REVIEW_STATUSES } from '../../services/review.api';
import { humanize, REVIEW_STATUS_TONE } from '../../types/admin';
import type { TableColumn } from '../../types/ui';
import { toErrorMessage } from '../../utils/error';
import { formatDateTime, formatRelative } from '../../utils/format';

const STATUS_OPTIONS = [
  { value: '', label: 'Any status' },
  ...REVIEW_STATUSES.map(status => ({ value: status, label: humanize(status) })),
];

const RATING_OPTIONS = [
  { value: '', label: 'Any rating' },
  ...[5, 4, 3, 2, 1].map(value => ({
    value: String(value),
    label: `${value} star${value === 1 ? '' : 's'}`,
  })),
];

const MODERATION_COPY: Record<ReviewStatus, { title: string; confirm: string }> = {
  published: { title: 'Publish this review?', confirm: 'Publish' },
  rejected: { title: 'Reject this review?', confirm: 'Reject' },
  pending: { title: 'Move this review back to pending?', confirm: 'Move to pending' },
};

/**
 * Review moderation.
 *
 * `GET /reviews` filters by status server-side, so moderation queues can be
 * worked directly. Every transition records a moderation reason and writes an
 * audit entry, which is why the dialog insists on one.
 */
export function AdminReviewsPage() {
  const toast = useToast();

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<ReviewStatus | ''>('');
  const [rating, setRating] = useState('');
  const [target, setTarget] = useState<{ review: Review; next: ReviewStatus }>();

  const reviews = useReviews({
    page,
    ...(status ? { status } : {}),
    ...(rating ? { rating: Number(rating) } : {}),
  });

  const moderate = useModerateReview();

  const reset = () => {
    setPage(1);
    setStatus('');
    setRating('');
  };

  const applyModeration = (reason: string) => {
    if (!target) return;
    const { review, next } = target;

    moderate.mutate(
      { reviewId: review._id, status: next, reason },
      {
        onSuccess: () => {
          setTarget(undefined);
          toast.success('Review updated', `Review is now ${humanize(next)}.`);
        },
        onError: (cause: unknown) =>
          toast.error(
            'Moderation failed',
            toErrorMessage(cause, 'The review could not be updated.')
          ),
      }
    );
  };

  const columns: Array<TableColumn<Review>> = [
    {
      key: 'review',
      header: 'Review',
      render: review => (
        <div className="max-w-md">
          {review.title && <p className="font-semibold text-slate-950">{review.title}</p>}
          <p className="text-sm text-gray-600">{review.comment}</p>
        </div>
      ),
    },
    {
      key: 'rating',
      header: 'Rating',
      render: review => (
        <span
          className="font-semibold text-slate-950 tabular-nums"
          aria-label={`${review.rating} out of 5`}
        >
          {review.rating} / 5
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: review => (
        <Badge tone={REVIEW_STATUS_TONE[review.status as ReviewStatus] ?? 'neutral'}>
          {humanize(review.status)}
        </Badge>
      ),
    },
    {
      key: 'created',
      header: 'Posted',
      render: review => (
        <span className="text-xs text-gray-500" title={formatDateTime(review.createdAt)}>
          {formatRelative(review.createdAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'text-right',
      render: review => (
        <div className="flex justify-end gap-2">
          {REVIEW_STATUSES.filter(next => next !== review.status).map(next => (
            <Button
              key={next}
              size="sm"
              variant={next === 'rejected' ? 'danger' : 'secondary'}
              disabled={moderate.isPending}
              onClick={() => setTarget({ review, next })}
            >
              {humanize(next)}
            </Button>
          ))}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <DataTable
        caption="Customer reviews across all courts"
        columns={columns}
        rows={reviews.data?.reviews ?? []}
        rowKey={review => review._id}
        isLoading={reviews.isLoading}
        isError={reviews.isError}
        {...(reviews.isError ? { errorMessage: toErrorMessage(reviews.error) } : {})}
        {...(reviews.isError ? { onRetry: () => void reviews.refetch() } : {})}
        emptyTitle="No reviews match"
        emptyDescription="Adjust the status or rating filter."
        emptyAction={
          <Button variant="secondary" onClick={reset}>
            Clear filters
          </Button>
        }
        toolbar={
          <FilterBar
            filters={[
              { name: 'status', label: 'Status', options: STATUS_OPTIONS, hideLabel: true },
              { name: 'rating', label: 'Rating', options: RATING_OPTIONS, hideLabel: true },
            ]}
            values={{ status, rating }}
            onFilterChange={(name, value) => {
              if (name === 'status') setStatus(value as ReviewStatus | '');
              if (name === 'rating') setRating(value);
              setPage(1);
            }}
            onReset={reset}
          />
        }
        pagination={{
          page,
          limit: reviews.data?.meta?.limit ?? 25,
          total: reviews.data?.meta?.total ?? 0,
          onPageChange: setPage,
        }}
        itemLabel="review"
      />

      <Notice variant="info">
        Only published reviews appear on the public courts page. Rejecting one hides it without
        deleting the author's text.
      </Notice>

      <ConfirmActionDialog
        open={Boolean(target)}
        title={target ? MODERATION_COPY[target.next].title : ''}
        description={
          target ? (
            <>
              This review ({target.review.rating}/5) will become{' '}
              <strong>{humanize(target.next)}</strong>.
            </>
          ) : undefined
        }
        requireReason
        reasonLabel="Moderation reason"
        confirmLabel={target ? MODERATION_COPY[target.next].confirm : 'Confirm'}
        confirmVariant={target?.next === 'rejected' ? 'danger' : 'primary'}
        isPending={moderate.isPending}
        onClose={() => setTarget(undefined)}
        onConfirm={applyModeration}
      />
    </div>
  );
}
