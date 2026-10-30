'use client';

import { use } from 'react';
import { InvoiceDetail } from '@/components/InvoiceDetail';

export default function InvoiceDetailPage({ params }: PageProps<'/invoices/[id]'>) {
  const { id } = use(params);
  return <InvoiceDetail id={id} />;
}
