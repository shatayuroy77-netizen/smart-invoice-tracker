import { redirect } from 'next/navigation';

// The app opens on the Scan tab.
export default function Home() {
  redirect('/scan');
}
