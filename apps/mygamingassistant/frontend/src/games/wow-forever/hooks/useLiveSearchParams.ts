import { useCallback } from "react";
import { useLocation, useNavigate, useSearchParams, type NavigateOptions } from "react-router-dom";

type ParamsUpdate = (prev: URLSearchParams) => URLSearchParams;
type SetLiveSearchParams = (update: ParamsUpdate, options?: NavigateOptions) => void;

/**
 * `useSearchParams`, but each update starts from the newest query — including one any hook on the
 * page just asked for. React Router hands a functional update the params of the last committed render,
 * and it renders navigations as transitions, so a second change made before that render commits (set a
 * destination, then at once your position) would start from the old query and silently drop the first.
 *
 * The browser router writes the address bar synchronously on every navigation (and Back updates it
 * before React hears of it), so while it shows this page its query is the newest one. A router that
 * doesn't drive the address bar (the in-memory router in tests) falls back to the committed query.
 */
export function useLiveSearchParams(): [URLSearchParams, SetLiveSearchParams] {
  const [params] = useSearchParams();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const setParams = useCallback<SetLiveSearchParams>(
    (update, options) => {
      const live = window.location.pathname === pathname ? window.location.search : search;
      navigate(`?${update(new URLSearchParams(live)).toString()}`, options);
    },
    [navigate, pathname, search],
  );
  return [params, setParams];
}
