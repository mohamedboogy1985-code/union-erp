import { useState, useEffect } from 'react';
import { getAuthenticatedAssetUrl } from '../services/api.js';

export function useAuthenticatedApiAsset(src: string) {
  const [assetUrl, setAssetUrl] = useState<string | null>(null);
  const [error, setError] = useState<unknown | null>(null);

  useEffect(() => {
    let isMounted = true;
    if (!src) {
      setAssetUrl(null);
      setError(null);
      return;
    }

    getAuthenticatedAssetUrl(src)
      .then((url: string) => {
        if (isMounted) {
          setAssetUrl(url);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          setError(err);
          setAssetUrl(null);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [src]);

  return { assetUrl, error };
}

export default useAuthenticatedApiAsset;
