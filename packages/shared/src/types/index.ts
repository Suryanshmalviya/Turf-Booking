export type UserRole = 'customer' | 'owner' | 'admin';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatarUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Venue {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  address: Address;
  location: GeoLocation;
  timezone: string;
  amenities: string[];
  images: string[];
  status: VenueStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface Address {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface GeoLocation {
  type: 'Point';
  coordinates: [number, number];
}

export type VenueStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export interface Pitch {
  id: string;
  venueId: string;
  name: string;
  description: string;
  type: PitchType;
  surface: SurfaceType;
  pricePerHour: Money;
  operatingHours: OperatingHours[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type PitchType = 'indoor' | 'outdoor' | 'covered';
export type SurfaceType = 'artificial_turf' | 'acrylic' | 'concrete' | 'wood' | 'clay';

export interface OperatingHours {
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  isClosed: boolean;
}

export interface Money {
  amount: number;
  currency: string;
}

export interface Booking {
  id: string;
  userId: string;
  pitchId: string;
  venueId: string;
  startTime: Date;
  endTime: Date;
  priceSnapshot: Money;
  cancellationPolicySnapshot: CancellationPolicy;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';
export type PaymentStatus = 'pending' | 'paid' | 'refunded' | 'failed' | 'partially_refunded';

export interface CancellationPolicy {
  freeCancellationHours: number;
  partialRefundHours: number;
  partialRefundPercent: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  requestId: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
