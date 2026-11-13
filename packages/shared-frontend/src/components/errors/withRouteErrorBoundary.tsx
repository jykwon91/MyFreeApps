import type { RouteObject } from "react-router-dom";
import StandaloneMain from "../layout/StandaloneMain";
import RouteErrorFallback from "./RouteErrorFallback";

/**
 * Wrap an app's route table in one pathless root route whose `errorElement`
 * is the shared {@link RouteErrorFallback}. A pathless route with no
 * `element` renders its matched child unchanged, so routing is identical —
 * the wrapper only catches render / loader / lazy-chunk errors that would
 * otherwise fall through to React Router's default developer error screen.
 * The fallback replaces the whole tree, shell included, so it brings its own
 * main landmark (StandaloneMain).
 *
 *   const router = createBrowserRouter(withRouteErrorBoundary(routes));
 */
export function withRouteErrorBoundary(routes: RouteObject[]): RouteObject[] {
  return [
    {
      errorElement: (
        <StandaloneMain>
          <RouteErrorFallback />
        </StandaloneMain>
      ),
      children: routes,
    },
  ];
}
