'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/scan', label: 'Scan', icon: 'M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M7 12h10' },
  { href: '/invoices', label: 'Invoices', icon: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6' },
  { href: '/payments', label: 'Payments', icon: 'M3 7h18v12H3zM3 11h18M7 15h3' },
  { href: '/prices', label: 'Prices', icon: 'M4 19V5M4 19h16M8 15l3-4 3 2 4-6' },
] as const;

// The bar itself. It does not look at the address, so it can be shown right away.
// `current` is the path of the open page (or null while it is still unknown).
export function NavBar({ current }: { current: string | null }) {
  return (
    <nav aria-label="Main" className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur">
      <ul className="mx-auto flex max-w-xl">
        {TABS.map((tab) => {
          const isActive = !!current && (current === tab.href || current.startsWith(tab.href + '/'));
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={isActive ? 'page' : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-medium ${
                  isActive ? 'text-teal-700' : 'text-slate-500'
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={isActive ? 2.2 : 1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d={tab.icon} />
                </svg>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// Reads the address to highlight the open tab. Wrapped in <Suspense> by the layout.
export function BottomNav() {
  return <NavBar current={usePathname()} />;
}
