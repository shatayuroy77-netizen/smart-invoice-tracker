import type { Metadata } from 'next';
import { InvoicesScreen } from '@/components/InvoicesScreen';
import { PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Invoices' };

export default function InvoicesPage() {
  return (
    <>
      <PageHeader title="Invoices" subtitle="Everything you have saved" />
      <InvoicesScreen />
    </>
  );
}
