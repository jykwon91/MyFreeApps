import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Reads the emailed `token` from the URL once, then removes it from the address bar so it
 * doesn't linger in history, screenshots or a shared link.
 */
export function useUrlToken(path: string): string | null {
  const [searchParams] = useSearchParams();
  const [token] = useState(() => searchParams.get("token"));

  useEffect(() => {
    if (token) {
      window.history.replaceState(null, "", path);
    }
  }, [token, path]);

  return token;
}
