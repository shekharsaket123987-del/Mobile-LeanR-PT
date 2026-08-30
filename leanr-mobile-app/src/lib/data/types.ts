/**
 * Shapes confirmed against the real database schema via direct
 * introspection (information_schema.columns + pg_constraint against the
 * "LeanR PT" Supabase project) — not guessed from PRD prose. Every field
 * below is a real column; nothing here is marked VERIFY anymore.
 */

export type BookingStatus = 'upcoming' | 'completed' | 'cancelled' | 'missed';

export type Booking = {
  id: string;
  client_id: string; // FK -> client_profiles.id (NOT the client's auth uid)
  coach_id: string; // FK -> coach_profiles.id (NOT the coach's auth uid)
  subscription_id: string | null;
  recurring_slot_id: string | null;
  scheduled_start: string; // ISO timestamp
  duration_minutes: number;
  status: BookingStatus;
  was_rescheduled: boolean;
  original_scheduled_start: string | null;
  quality_rating: number | null;
  trainer_rating: number | null;
  rating_note: string | null;
  no_show_party: string | null; // free text column, not an enum
  attendance_overdue: boolean;
  notes_overdue: boolean;
  coach_joined_at: string | null;
  zoom_join_url: string | null;
  zoom_start_url: string | null;
  coach_name?: string | null; // present when joined via coach_profiles(profiles(full_name))
};

/** `client_profiles` row, generally selected joined with `profiles(full_name, photo_url)`. */
export type ClientProfile = {
  id: string; // used as bookings.client_id etc — NOT the same as profile_id
  profile_id: string; // FK -> profiles.id (the auth uid)
  status: string;
  full_name?: string; // present when joined via profiles(full_name)
};

/** `coach_profiles` row, generally selected joined with `profiles(full_name, photo_url)`. */
export type CoachProfile = {
  id: string; // used as bookings.coach_id etc — NOT the same as profile_id
  profile_id: string; // FK -> profiles.id (the auth uid)
  bio: string | null;
  specialization: string | null;
  full_name?: string; // present when joined via profiles(full_name)
  photo_url?: string | null; // present when joined via profiles(photo_url)
};

export type SubscriptionStatus = 'active' | 'inactive' | 'paused' | 'awaiting_activation';

export type Subscription = {
  id: string;
  client_id: string; // FK -> client_profiles.id
  package_id: string;
  status: SubscriptionStatus;
  sessions_total: number;
  // NOTE: there is no sessions_used column — "used" is derived by
  // counting bookings for this subscription_id with status='completed'.
};

export type ProgressLog = {
  id: string;
  client_id: string; // FK -> client_profiles.id
  logged_at: string;
  weight: number | null;
  notes: string | null;
};

export type Plan = {
  id: string;
  name: string;
  sessions_count: number;
  price: number; // plain currency amount, NOT integer paise
  is_active: boolean;
};

export type Conversation = {
  id: string;
  client_id: string; // FK -> client_profiles.id
  coach_id: string; // FK -> coach_profiles.id
  status: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_role: string;
  sender_profile_id: string; // FK -> profiles.id (the auth uid of the sender)
  body: string | null;
  attachment_url: string | null;
  created_at: string;
  read_at: string | null;
};
