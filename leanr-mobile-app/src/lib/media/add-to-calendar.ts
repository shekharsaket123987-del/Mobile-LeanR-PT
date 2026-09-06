/**
 * "Add to Calendar" — mockup's demo-confirmation and pre-purchase-Home
 * frames. Genuinely new capability, no existing web equivalent to port
 * (per the redesign plan). Uses `expo-calendar`'s default writable
 * calendar (source-appropriate per platform — iOS uses the default
 * calendar's own source, Android requires picking a local account-backed
 * calendar) rather than creating a dedicated "LEANR" calendar, since a
 * one-off event doesn't warrant a whole new calendar.
 */
import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';

async function getWritableCalendarId(): Promise<string> {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const writable = calendars.find((c) => c.allowsModifications);
  if (writable) return writable.id;

  if (Platform.OS === 'ios') {
    const defaultCalendar = await Calendar.getDefaultCalendarAsync();
    return defaultCalendar.id;
  }

  const newCalendarId = await Calendar.createCalendarAsync({
    title: 'LEANR',
    color: '#12A594',
    entityType: Calendar.EntityTypes.EVENT,
    source: { isLocalAccount: true, name: 'LEANR', type: 'LOCAL' },
    name: 'leanr',
    ownerAccount: 'LEANR',
    accessLevel: Calendar.CalendarAccessLevel.OWNER,
  });
  return newCalendarId;
}

export async function addToDeviceCalendar(event: { title: string; startDate: Date; durationMinutes: number; notes?: string }): Promise<void> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  if (status !== 'granted') throw new Error('Calendar permission was not granted.');

  const calendarId = await getWritableCalendarId();
  const endDate = new Date(event.startDate.getTime() + event.durationMinutes * 60_000);

  await Calendar.createEventAsync(calendarId, {
    title: event.title,
    startDate: event.startDate,
    endDate,
    notes: event.notes,
    timeZone: 'Asia/Kolkata',
  });
}
