import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AsyncBoundary } from '../src/components/common/AsyncBoundary';
import { ApiError } from '../src/utils/error';

/**
 * The shared boundary is what makes loading/error/empty states uniform across
 * pages, so its branch order is worth pinning down: a failure that has already
 * been observed must win over a still-pending state, and the retry it offers
 * must re-run the query rather than reset anything else.
 */

const content = () => <p>Court list</p>;

const resolved = (data: unknown) => ({ isPending: false, isError: false, data });

describe('AsyncBoundary', () => {
  it('shows a loading state while the first read is in flight', () => {
    render(
      <AsyncBoundary query={{ isPending: true, isError: false }} loadingMessage="Loading courts">
        {content()}
      </AsyncBoundary>
    );

    expect(screen.getByRole('status')).toHaveTextContent('Loading courts');
    expect(screen.queryByText('Court list')).not.toBeInTheDocument();
  });

  it('renders the content once the read resolves', () => {
    render(<AsyncBoundary query={resolved(['court-1'])}>{content()}</AsyncBoundary>);

    expect(screen.getByText('Court list')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('surfaces the failure message from an API error', () => {
    render(
      <AsyncBoundary
        query={{
          isPending: false,
          isError: true,
          error: new ApiError(403, { code: 'FORBIDDEN', message: 'Venue is closed' }),
        }}
      >
        {content()}
      </AsyncBoundary>
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Venue is closed');
    expect(screen.queryByText('Court list')).not.toBeInTheDocument();
  });

  it('re-runs the query when the retry action is used', () => {
    const refetch = vi.fn();

    render(
      <AsyncBoundary query={{ isPending: false, isError: true, error: new Error('Boom'), refetch }}>
        {content()}
      </AsyncBoundary>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('omits the retry button when no refetch is offered', () => {
    render(
      <AsyncBoundary query={{ isPending: false, isError: true, error: new Error('Boom') }}>
        {content()}
      </AsyncBoundary>
    );

    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('prefers the error over the pending state so a failed retry is visible', () => {
    render(
      <AsyncBoundary query={{ isPending: true, isError: true, error: new Error('Still failing') }}>
        {content()}
      </AsyncBoundary>
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Still failing');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows the empty state instead of content when there is nothing to render', () => {
    render(
      <AsyncBoundary
        query={resolved([])}
        isEmpty={data => Array.isArray(data) && data.length === 0}
        empty={{ title: 'No courts yet', description: 'Publish a venue to get started' }}
      >
        {content()}
      </AsyncBoundary>
    );

    expect(screen.getByText('No courts yet')).toBeInTheDocument();
    expect(screen.getByText('Publish a venue to get started')).toBeInTheDocument();
    expect(screen.queryByText('Court list')).not.toBeInTheDocument();
  });

  it('keeps the content when the empty branch is not configured', () => {
    render(<AsyncBoundary query={resolved([])}>{content()}</AsyncBoundary>);

    expect(screen.getByText('Court list')).toBeInTheDocument();
  });

  it('announces a background refetch without hiding the content', () => {
    render(
      <AsyncBoundary query={{ ...resolved(['court-1']), isFetching: true }} isStale>
        {content()}
      </AsyncBoundary>
    );

    expect(screen.getByText('Court list')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Updating');
  });

  it('stays quiet about background refetches when the caller does not ask', () => {
    render(
      <AsyncBoundary query={{ ...resolved(['court-1']), isFetching: true }}>
        {content()}
      </AsyncBoundary>
    );

    expect(screen.getByText('Court list')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
