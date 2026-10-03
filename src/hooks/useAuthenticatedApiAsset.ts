import { useEffect, useState } from 'react';
import { fetchAuthenticatedBlob } from '../services/api.js';

export function useAuthenticatedApiAsset(url: string | null) {
  const [assetUrl, setAssetUrl] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    const controller = new AbortController();
    setAssetUrl(null);
    setError(null);

    if (!url) return () => controller.abort();

    void fetchAuthenticatedBlob(url, { signal: controller.signal })
      .then((blob) => {
        const nextUrl = URL.createObjectURL(blob);
        if (!active) {
          URL.revokeObjectURL(nextUrl);
          return;
        }
        objectUrl = nextUrl;
        setAssetUrl(nextUrl);
      })
      .catch((reason: unknown) => {
        if (active && !(reason instanceof DOMException && reason.name === 'AbortError')) {
          setError(reason instanceof Error ? reason : new Error('تعذّر تحميل الملف.'));
        }
      });

    return () => {
      active = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  return { assetUrl, error };
}
