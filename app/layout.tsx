import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import { BottomNav, NavBar } from '@/components/BottomNav';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Smart Invoice Tracker', template: '%s · Smart Invoice Tracker' },
  description: 'Scan supplier invoices, track payments and watch supplier prices.',
  applicationName: 'Invoice Tracker',
  appleWebApp: { capable: true, title: 'Invoices', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#0f766e',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <div className="page-bottom-space mx-auto max-w-xl px-4 pt-4">
          <Suspense fallback={<p className="p-6 text-center text-sm text-slate-500">Loading...</p>}>{children}</Suspense>
        </div>
        <Suspense fallback={<NavBar current={null} />}>
          <BottomNav />
        </Suspense>
      </body>
    </html>
  );
}
