import { useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { GEAR_VIEW } from "@/games/wow-forever/data/gear/gearViews";
import { GEAR_URL_PARAMS } from "@/games/wow-forever/hooks/useGearSettings";
import { decodeBisListFragment, isBisListFragment } from "@/games/wow-forever/lib/bisLists/bisListFragment";
import type { SharedBisListLink } from "@/games/wow-forever/types/bisLists/sharedBisListLink";

/** A share link in the URL fragment, decoded (never trusted), and a way to leave it. */
export function useSharedBisListLink(): SharedBisListLink {
  const { hash, pathname, search } = useLocation();
  const navigate = useNavigate();
  const present = isBisListFragment(hash);
  const list = useMemo(() => (present ? decodeBisListFragment(hash) : null), [present, hash]);

  const close = useCallback(() => {
    const params = new URLSearchParams(search);
    params.set(GEAR_URL_PARAMS.view, GEAR_VIEW.mine);
    navigate({ pathname, search: `?${params.toString()}`, hash: "" }, { replace: true });
  }, [navigate, pathname, search]);

  return { present, list, close };
}
