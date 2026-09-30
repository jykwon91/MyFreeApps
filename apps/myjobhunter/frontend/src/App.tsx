import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { withRouteErrorBoundary } from "@platform/ui";
import { routes } from "@/routes";

// withRouteErrorBoundary: shared errorElement so a render error or a stale
// lazy chunk after a deploy shows a recoverable screen, not React Router's
// default developer error page.
const router = createBrowserRouter(withRouteErrorBoundary(routes));

export default function App() {
  return <RouterProvider router={router} />;
}
