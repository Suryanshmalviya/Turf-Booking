import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { HomePage } from '../src/pages/public/HomePage';
import { NotFoundPage } from '../src/pages/public/NotFoundPage';
import { renderWithProviders } from './helpers/render';

describe('HomePage', () => {
  it('renders the hero heading', () => {
    renderWithProviders(<HomePage />);

    expect(screen.getByText('Book Your Perfect Pickleball Court')).toBeInTheDocument();
  });

  it('renders the primary call to action', () => {
    renderWithProviders(<HomePage />);

    expect(screen.getByRole('link', { name: 'Find Courts' })).toHaveAttribute('href', '/venues');
  });

  it('renders the three feature cards', () => {
    renderWithProviders(<HomePage />);

    expect(screen.getByText('Search venues')).toBeInTheDocument();
    expect(screen.getByText('Real-time availability')).toBeInTheDocument();
    expect(screen.getByText('Secure payments')).toBeInTheDocument();
  });

  it('renders the how it works steps', () => {
    renderWithProviders(<HomePage />);

    expect(screen.getByText('How It Works')).toBeInTheDocument();
    expect(screen.getByText('Search & filter')).toBeInTheDocument();
    expect(screen.getByText('Select & book')).toBeInTheDocument();
    expect(screen.getByText('Play & enjoy')).toBeInTheDocument();
  });
});

describe('NotFoundPage', () => {
  it('renders the 404 message and a route home', () => {
    renderWithProviders(<NotFoundPage />);

    expect(screen.getByText('404')).toBeInTheDocument();
    expect(screen.getByText('Page Not Found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go Home' })).toHaveAttribute('href', '/');
  });
});
