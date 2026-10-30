'use client';

// Loads data from one of our own API routes and keeps it up to date.
//   const { data, error, loading, reload } = useApi<MyType>('/api/payments');
// - `loading` is true while a request is running; `data` keeps the previous answer meanwhile,
//   so the screen does not flash empty when you type in a search box.
// - Pass null as the url to do nothing.
import { useEffect, useState } from 'react';

interface Result<T> {
  key: string;
  data?: T;
  error?: string;
}

export function useApi<T>(url: string | null) {
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<Result<T> | null>(null);
  const key = url ? `${url}#${version}` : null;

  useEffect(() => {
    if (!url || !key) return;
    let cancelled = false;
    fetch(url, { cache: 'no-store' })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || body?.ok === false) setResult({ key, error: body?.error ?? 'Something went wrong. Please try again.' });
        else setResult({ key, data: body as T });
      })
      .catch(() => {
        if (!cancelled) setResult({ key, error: 'Could not reach the server. Check your internet.' });
      });
    return () => {
      cancelled = true;
    };
  }, [url, key]);

  const fresh = result !== null && result.key === key;
  return {
    data: result?.data,
    error: fresh ? result.error : undefined,
    loading: key !== null && !fresh,
    reload: () => setVersion((v) => v + 1),
  };
}
