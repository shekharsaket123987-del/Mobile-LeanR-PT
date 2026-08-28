/**
 * §3/§22: role is the single source of authorization truth. This is the
 * one place that maps a resolved `profiles.role` to a home route for all
 * four (auth)/(client)/(coach)/(admin) layouts — a regression here would
 * silently misroute an entire role.
 */
import { describe, expect, it } from '@jest/globals';

import { getHomeRouteForRole } from '../role-routing';

describe('getHomeRouteForRole', () => {
  it('routes a client to the client group root', () => {
    expect(getHomeRouteForRole('client')).toBe('/(client)');
  });

  it('routes a coach to the coach group root', () => {
    expect(getHomeRouteForRole('coach')).toBe('/(coach)');
  });

  it('routes an admin to the admin group root (reduced on-call-ops scope)', () => {
    expect(getHomeRouteForRole('admin')).toBe('/(admin)');
  });

  it('falls back to /unsupported-role for an unresolved/unknown role rather than guessing', () => {
    expect(getHomeRouteForRole(undefined)).toBe('/unsupported-role');
  });
});
