import type { MetadataRoute } from 'next';

// This file makes the app installable: "Add to Home screen" on a phone or iPad.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Smart Invoice Tracker',
    short_name: 'Invoices',
    description: 'Scan supplier invoices, track payments and watch supplier prices.',
    start_url: '/scan',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f6f7f9',
    theme_color: '#0f766e',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Scan an invoice', url: '/scan' },
      { name: 'Payments due', url: '/payments' },
    ],
  };
}
