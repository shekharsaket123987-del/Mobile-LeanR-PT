/**
 * Shapes for the tables/columns the functional PRD documents with
 * certainty (LEANR_PT_MOBILE_PRD.md §5–§12). Where a field name is a
 * best-effort guess rather than a documented certainty, it's marked
 * VERIFY — check against the real `supabase/migrations/*.sql` before
 * trusting it in a write path.
 */

export type BookingStatus = 'upcoming' | 'completed' | 'cancelled' | 'missed';

export type Booking = {
  id: string;
  scheduled_start: string; // ISO timestamp
  duration_minutes: number; // VERIFY exact column name
  status: BookingStatus;
  coach_id: string | null; // VERIFY exact column name
  was_rescheduled: boolean;
  original_scheduled_start: string | null;
  quality_rating: number | null;
  trainer_rating: number | null;
  rating_note: string | null;
  recurring_slot_id: string | null;
  no_show_party: 'client' | 'coach' | null;
  attendance_overdue: boolean;
  coach_joined_at: string | null; // VERIFY exact column name — see original PRD §7g
  zoom_join_url: string | null; // VERIFY exact column name — see original PRD §7f (ensureZoomMeetingForBooking)
};

export type ClientProfile = {
  id: string;
  full_name: string; // VERIFY exact column name
  coach_id: string | null; // VERIFY exact column name
};

export type CoachProfile = {
  id: string;
  full_name: string; // VERIFY exact column name
  photo_url: string | null; // VERIFY exact column name
  bio: string | null; // VERIFY exact column name
};

export type SubscriptionStatus = 'active' | 'inactive' | 'paused' | 'awaiting_activation';

export type Subscription = {
  id: string;
  status: SubscriptionStatus;
  sessions_total: number | null; // VERIFY exact column name
  sessions_used: number | null; // VERIFY exact column name
};

export type ProgressLog = {
  id: string;
  logged_at: string; // VERIFY exact column name
  weight_kg: number | null; // VERIFY exact column name
  note: string | null; // VERIFY exact column name
};

export type Plan = {
  id: string;
  name: string; // VERIFY exact column name
  price_paise: number; // VERIFY exact column name — original PRD §8g works in paise
  sessions_count: number | null; // VERIFY exact column name
};
