import { useCallback, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigate, useSearchParams, type NavigateOptions } from "react-router-dom";

type ParamsUpdate = (prev: URLSearchParams) => URLSearchParams;
type SetLiveSearchParams = (update: ParamsUpdate, options?: NavigateOptions) => void;

/**
 * `useSearchParams`, but each update starts from the newest query — including one this hook just
 * asked for. React Router hands a functional update the params of the last committed render, and it
 * renders navigations as transitions, so a second change made before that render commits (pick a
 * status, then at once an area) would start from the old query and silently drop the first change.
 */
export function useLiveSearchParams(): [URLSearchParams, SetLiveSearchParams] {
  const [params] = useSearchParams();
  const { search } = useLocation();
  const navigate = useNavigate();
  const latest = useRef(search);
  // Any committed navigation (Back, a link) is the new truth.
  useLayoutEffect(() => {
    latest.current = search;
  }, [search]);
  const setParams = useCallback<SetLiveSearchParams>(
    (update, options) => {
      const next = `?${update(new URLSearchParams(latest.current)).toString()}`;
      latest.current = next;
      navigate(next, options);
    },
    [navigate],
  );
  return [params, setParams];
}
