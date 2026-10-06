/**
 * Single source of truth for route paths. Components import from here instead of
 * hard-coding URLs, so a path change stays a one-line edit.
 */
export const ROUTES = {
  home: '/',
  login: '/login',
  register: '/register',

  venues: '/venues',
  venueDetail: (venueId: string) => `/venues/${venueId}`,
  /** Availability grid for one venue, optionally pre-selecting a court. */
  venueBooking: (venueId: string, pitchId?: string) =>
    pitchId ? `/venues/${venueId}/book?pitch=${encodeURIComponent(pitchId)}` : `/venues/${venueId}/book`,

  checkout: '/checkout',
  /** Receipt shown after the server confirms a booking. */
  confirmation: (bookingId: string) => `/bookings/${bookingId}/confirmation`,
  bookings: '/bookings',
  bookingDetail: (bookingId: string) => `/bookings/${bookingId}`,

  admin: '/admin',
} as const;

/** Where the customer lands after signing in or out. */
export const AUTH_HOME = ROUTES.home;

/**
 * Route *patterns*, for the entries in the route table. `ROUTES` above builds
 * concrete hrefs; these keep the table itself free of duplicated literals that
 * could drift from the helpers.
 */
export const PATHS = {
  venueDetail: '/venues/:venueId',
  venueBooking: '/venues/:venueId/book',
  bookingDetail: '/bookings/:bookingId',
  bookingConfirmation: '/bookings/:bookingId/confirmation',

  // Admin console: one nested route per section, with `admin` as the index.
  admin: '/admin',
  adminDashboard: '/admin',
  adminUsers: '/admin/users',
  adminCourts: '/admin/courts',
  adminBookings: '/admin/bookings',
  adminPayments: '/admin/payments',
  adminReviews: '/admin/reviews',
  adminReports: '/admin/reports',
  adminSettings: '/admin/settings',
} as const;