import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';

import { Container } from '../../components/common/Container';
import { Card } from '../../components/ui/Card';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { ROUTES } from '../../routes/paths';

const FEATURES = [
  {
    title: 'Search venues',
    description:
      'Find pickleball courts near you with filters for location, price, amenities and court type.',
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 12a7.975 7.975 0 01-2.343 6.657z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
    ),
  },
  {
    title: 'Real-time availability',
    description:
      'See live court availability and book instantly. No more calling venues for confirmations.',
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
  },
  {
    title: 'Secure payments',
    description:
      'Pay safely with a verified provider. Your payment details are never stored on our servers.',
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
        />
      </svg>
    ),
  },
];

const STEPS = [
  { number: '01', title: 'Search & filter', description: 'Enter your location, date and time.' },
  {
    number: '02',
    title: 'Select & book',
    description: 'Pick a court and slot, then confirm your hold.',
  },
  {
    number: '03',
    title: 'Play & enjoy',
    description: 'Receive instant confirmation and turn up to play.',
  },
];

export function HomePage() {
  useDocumentTitle('Book a pickleball court');

  return (
    <div className="flex flex-col">
      <section className="relative py-20 text-white sm:py-32" style={background('/hero-court.jpg')}>
        <div className="absolute inset-0 bg-black/55" aria-hidden="true" />
        <Container size="wide" className="relative z-10">
          <div className="max-w-3xl">
            <h1 className="mb-6 text-4xl font-bold tracking-tight drop-shadow-lg sm:text-5xl lg:text-6xl">
              Book Your Perfect Pickleball Court
            </h1>
            <p className="mb-8 max-w-2xl text-xl text-white/90 drop-shadow">
              Discover and reserve pickleball courts at top venues near you. Real-time availability,
              instant booking, and secure payments.
            </p>
            <Link to={ROUTES.venues} className="btn bg-white text-primary-700 hover:bg-primary-50">
              Find Courts
            </Link>
          </div>
        </Container>
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-gray-50 to-transparent" />
      </section>

      <section className="relative z-10 -mt-16 py-16 sm:py-24">
        <Container size="wide">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {FEATURES.map(feature => (
              <Card key={feature.title} className="p-6 transition-shadow hover:shadow-md">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary-100 text-primary-700">
                  {feature.icon}
                </div>
                <h3 className="mb-2 text-xl font-semibold text-gray-900">{feature.title}</h3>
                <p className="text-gray-600">{feature.description}</p>
              </Card>
            ))}
          </div>
        </Container>
      </section>

      <section className="bg-white py-16 sm:py-24">
        <Container size="wide">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-3xl font-bold text-gray-900 sm:text-4xl">How It Works</h2>
            <p className="mx-auto max-w-2xl text-lg text-gray-600">
              Book your court in three simple steps
            </p>
          </div>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {STEPS.map(step => (
              <StepCard key={step.number} {...step} />
            ))}
          </div>
        </Container>
      </section>

      <section
        className="relative py-20 text-white sm:py-28"
        style={background('/cta-pickleball.png')}
      >
        <div className="absolute inset-0 bg-black/60" aria-hidden="true" />
        <Container size="wide" className="relative z-10 text-center">
          <h2 className="mb-4 text-3xl font-bold drop-shadow-lg sm:text-5xl">Ready to Play?</h2>
          <p className="mx-auto mb-8 max-w-2xl text-lg text-white/90 drop-shadow sm:text-xl">
            Join players booking courts every day. Find your next game now.
          </p>
          <Link
            to={ROUTES.venues}
            className="btn bg-white text-lg text-primary-700 shadow-md hover:bg-primary-50"
          >
            Browse Courts
          </Link>
        </Container>
      </section>
    </div>
  );
}

function StepCard({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <Card className="relative p-6">
      <span className="absolute -top-3 left-6 rounded-full bg-primary-600 px-3 py-1 text-sm font-bold text-white">
        {number}
      </span>
      <div className="pt-4">
        <h3 className="mb-2 text-xl font-semibold text-gray-900">{title}</h3>
        <p className="text-gray-600">{description}</p>
      </div>
    </Card>
  );
}

function background(image: string): CSSProperties {
  return {
    backgroundImage: `url(${image})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  };
}
