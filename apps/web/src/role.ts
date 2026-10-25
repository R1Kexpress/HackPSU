import { useCallback, useState } from 'react';

export const ROLES = ['health_worker', 'family', 'clinic'] as const;
export type Role = (typeof ROLES)[number];
export const WEB_ROLES = ['health_worker', 'clinic'] as const;

const ROLE_KEY = 'aman.role';
const PIN_KEY = 'aman.dashboardPin';

export interface NavLink {
  to: string;
  labelKey: string;
}

/** The first link is the role's home page. */
export const ROLE_LINKS: Record<Role, NavLink[]> = {
  health_worker: [
    { to: '/', labelKey: 'field_link' },
    { to: '/limits', labelKey: 'limits_link' },
  ],
  family: [
    { to: '/voice', labelKey: 'voice_link' },
    { to: '/limits', labelKey: 'limits_link' },
  ],
  clinic: [
    { to: '/clinic', labelKey: 'clinic_link' },
    { to: '/limits', labelKey: 'limits_link' },
  ],
};

export function roleHome(role: Role): string {
  return ROLE_LINKS[role][0].to;
}

export function roleAllows(role: Role, path: string): boolean {
  if (role === 'family') return false;
  return ROLE_LINKS[role].some((l) => (l.to === '/' ? path === '/' : path.startsWith(l.to)));
}

function readRole(): Role | null {
  const v = localStorage.getItem(ROLE_KEY);
  return (WEB_ROLES as readonly string[]).includes(v ?? '') ? (v as Role) : null;
}

export function useRole(): [Role | null, (r: Role | null) => void] {
  const [role, setRoleState] = useState<Role | null>(readRole);
  const setRole = useCallback((r: Role | null) => {
    if (r) localStorage.setItem(ROLE_KEY, r);
    else localStorage.removeItem(ROLE_KEY);
    // Switching roles must not carry a clinic PIN over to the next person using the phone.
    sessionStorage.removeItem(PIN_KEY);
    setRoleState(r);
  }, []);
  return [role, setRole];
}
