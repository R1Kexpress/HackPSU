import type { ReactNode } from 'react';

const paths = {
  stethoscope: <><path d="M6 3v6a4 4 0 0 0 8 0V3M4 3h3m6 0h3M10 13v3a5 5 0 0 0 10 0v-3" /><circle cx="20" cy="10" r="2" /></>,
  clinic: <><path d="M4 21V6l8-3 8 3v15M2 21h20M12 7v8m-4-4h8" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 2" /></>,
  home: <><path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8" /></>,
  warning: <><path d="m12 3 10 18H2L12 3Z M12 9v5m0 3v.1" /></>,
  medicine: <><path d="m9 15 6-6M5 19a5 5 0 0 1 0-7l7-7a5 5 0 0 1 7 7l-7 7a5 5 0 0 1-7 0Z" /></>,
  heart: <path d="M20.8 5.6a5.5 5.5 0 0 0-8.8.7 5.5 5.5 0 0 0-8.8-.7C-.4 10 5 15.8 12 21c7-5.2 12.4-11 8.8-15.4Z" />,
  location: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2" /></>,
  printer: <><path d="M7 8V3h10v5M7 17H3V9h18v8h-4M7 14h10v7H7Z M17 11h1" /></>,
} satisfies Record<string, ReactNode>;

export function Icon({ name, className = 'h-6 w-6' }: { name: keyof typeof paths; className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`} aria-hidden="true">{paths[name]}</svg>;
}
