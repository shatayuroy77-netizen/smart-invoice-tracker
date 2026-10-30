import type { Metadata } from 'next';
import { PricesScreen } from '@/components/PricesScreen';
import { PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Prices' };

export default function PricesPage() {
  return (
    <>
      <PageHeader title="Prices" subtitle="Who charges what, and what is going up" />
      <PricesScreen />
    </>
  );
}
