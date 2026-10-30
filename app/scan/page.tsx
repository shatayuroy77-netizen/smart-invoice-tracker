import type { Metadata } from 'next';
import { ScanScreen } from '@/components/ScanScreen';
import { PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Scan' };

export default function ScanPage() {
  return (
    <>
      <PageHeader title="Scan" subtitle="Photograph a supplier invoice" />
      <ScanScreen />
    </>
  );
}
