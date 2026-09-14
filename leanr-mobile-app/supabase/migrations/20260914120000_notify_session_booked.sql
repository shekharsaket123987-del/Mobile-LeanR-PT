-- GAP-07 (COM-003a): no notification fired when a client booked a regular or demo session on
-- mobile — `booking-wizard.ts`'s hold->confirm flow never called anything equivalent to what
-- web's TypeScript service layer does after its own booking RPC succeeds.
--
-- Deliberately NOT a table trigger on `bookings`: this app shares its database with the web
-- app, and web's own service layer already inserts this notification after its booking flow
-- succeeds. An `AFTER INSERT ON bookings` trigger would double-notify every web-created
-- booking (once from web's service code, once from this trigger). Instead this is a
-- SECURITY DEFINER function the MOBILE app calls explicitly, once, right after its own
-- `confirm_booking()` RPC succeeds — see booking-wizard.ts / demo-booking.ts call sites.
-- SECURITY DEFINER is required because the client-authenticated caller has no RLS grant to
-- insert a notification row for the coach's own user_id.
create or replace function public.notify_session_booked(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_booking record;
  v_client_profile_id uuid;
  v_coach_profile_id uuid;
  v_when text;
begin
  select client_id, coach_id, session_type, scheduled_start
  into v_booking
  from public.bookings
  where id = p_booking_id;

  if not found then
    return;
  end if;

  select profile_id into v_client_profile_id from public.client_profiles where id = v_booking.client_id;
  select profile_id into v_coach_profile_id from public.coach_profiles where id = v_booking.coach_id;
  v_when := to_char(v_booking.scheduled_start, 'FMDD Mon HH12:MI AM');

  if v_client_profile_id is not null then
    insert into public.notifications (user_id, type, title, message, template_key)
    values (
      v_client_profile_id,
      'booking',
      case when v_booking.session_type = 'assessment' then 'Demo booked' else 'Session booked' end,
      'Your session is confirmed for ' || v_when || '.',
      case when v_booking.session_type = 'assessment' then 'demo_booked_client' else 'session_booked_client' end
    );
  end if;

  if v_coach_profile_id is not null then
    insert into public.notifications (user_id, type, title, message, template_key)
    values (
      v_coach_profile_id,
      'booking',
      case when v_booking.session_type = 'assessment' then 'Demo booked' else 'Session booked' end,
      'A client booked a session for ' || v_when || '.',
      case when v_booking.session_type = 'assessment' then 'demo_booked_coach' else 'session_booked_coach' end
    );
  end if;
end;
$function$;

grant execute on function public.notify_session_booked(uuid) to authenticated;
