import type { Metadata } from 'next';
import { PaymentsScreen } from '@/components/PaymentsScreen';
import { PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Payments' };

export default function PaymentsPage() {
  return (
    <>
      <PageHeader title="Payments" subtitle="What you owe your suppliers" />
      <PaymentsScreen />
    </>
  );
}
