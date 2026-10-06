import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Badge } from '../src/components/ui/Badge';
import { Button } from '../src/components/ui/Button';
import { Dialog } from '../src/components/ui/Dialog';
import { EmptyState } from '../src/components/ui/EmptyState';
import { ErrorState } from '../src/components/ui/ErrorState';
import { Input } from '../src/components/ui/Input';
import { Pagination } from '../src/components/ui/Pagination';
import { Table } from '../src/components/ui/Table';

describe('Button', () => {
  it('defaults to type="button" so it cannot submit a form by accident', () => {
    render(<Button>Save</Button>);

    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'button');
  });

  it('disables itself and reports busy state while loading', () => {
    render(<Button loading>Save</Button>);

    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('calls onClick when pressed', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);

    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('Input', () => {
  it('associates its label, hint and error with the control', () => {
    render(<Input label="Email" hint="We never share it" error="Enter a valid email address" />);

    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address');
  });
});

describe('Badge', () => {
  it('renders its children', () => {
    render(<Badge tone="success">Confirmed</Badge>);

    expect(screen.getByText('Confirmed')).toBeInTheDocument();
  });
});

describe('Pagination', () => {
  it('summarises the visible range and total', () => {
    render(<Pagination page={2} limit={10} total={42} onPageChange={vi.fn()} itemLabel="venue" />);

    expect(screen.getByText('11–20 of 42 venues')).toBeInTheDocument();
  });

  it('hides the controls when everything fits on one page', () => {
    render(<Pagination page={1} limit={25} total={3} onPageChange={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
  });

  it('disables Previous on the first page and reports the requested page', () => {
    const onPageChange = vi.fn();
    render(<Pagination page={1} limit={10} total={42} onPageChange={onPageChange} />);

    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});

describe('Table', () => {
  const columns = [
    { key: 'name', header: 'Name', render: (row: { name: string }) => row.name },
    { key: 'role', header: 'Role', render: (row: { role: string }) => row.role },
  ];

  it('renders a header and one row per record', () => {
    render(
      <Table
        columns={columns}
        rows={[
          { name: 'Court House', role: 'customer' },
          { name: 'Riverside', role: 'admin' },
        ]}
        rowKey={row => row.name}
      />
    );

    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Court House' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'admin' })).toBeInTheDocument();
  });

  it('falls back to an empty message', () => {
    render(<Table columns={columns} rows={[]} rowKey={() => 'x'} emptyMessage="Nothing queued." />);

    expect(screen.getByText('Nothing queued.')).toBeInTheDocument();
  });
});

describe('EmptyState and ErrorState', () => {
  it('renders empty state copy and action', () => {
    render(<EmptyState title="No venues" description="Try again later" action={<button>Retry</button>} />);

    expect(screen.getByText('No venues')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('renders an alert with a retry handler', () => {
    const onRetry = vi.fn();
    render(<ErrorState message="Network down" onRetry={onRetry} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Network down');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
  });
});

describe('Dialog', () => {
  function Harness({ onConfirm }: { onConfirm: () => void }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>Open</button>
        <Dialog
          open={open}
          onClose={() => setOpen(false)}
          onConfirm={onConfirm}
          title="Approve venue"
          confirmLabel="Approve"
        >
          <p>Are you sure?</p>
        </Dialog>
      </>
    );
  }

  it('is hidden until opened and confirms the action', () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('dialog', { name: 'Approve venue' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});