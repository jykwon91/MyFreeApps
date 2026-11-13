import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { Toaster, withRouteErrorBoundary } from "@platform/ui";
import { routes } from "./routes";

// withRouteErrorBoundary: shared errorElement so a render error or a stale
// lazy chunk after a deploy shows a recoverable screen, not React Router's
// default developer error page.
// Toaster mounts once here, above the router, so every route (signed-in shell and
// public pages alike) shows toasts. A second one anywhere below would show each
// toast twice.
const router = createBrowserRouter(withRouteErrorBoundary(routes));

export default function App() {
  return (
    <>
      <Toaster />
      <RouterProvider router={router} />
    </>
  );
}
