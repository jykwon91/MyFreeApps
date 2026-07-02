import type { ReactNode } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Lock } from "lucide-react";
import Button from "../ui/Button";
import { useIsAuthenticated } from "../../lib/auth-store";

export interface AuthRequiredProps {
  /** What the user is trying to do, e.g., "manage sources". Shown in the fallback. */
  action?: string;
  /** Optional longer description rendered below the primary CTA copy. */
  description?: string;
  /**
   * When true, the gated route can never be satisfied in this deployment (e.g.
   * a serve-only / no-auth build where the backend mounts no login route).
   * Rather than showing a Sign-in card that points at a /login route that
   * would 404, redirect to the public home. Fail closed: gated content is
   * never rendered when ``unavailable`` is set, even if a stale token is
   * present.
   */
  unavailable?: boolean;
  /** The gated content. */
  children: ReactNode;
}

/**
 * AuthRequired — gate a write-surface route or sub-tree behind authentication.
 *
 * For a public-read / auth-write app: anyone can browse, but mutations and
 * operational pages are auth-only. This component is the one and only frontend
 * gate — every gated route should wrap its top-level component with
 * `<AuthRequired action="...">`.
 *
 * When unauthenticated, renders a centered card explaining what auth would
 * unlock and a "Sign in" button that routes to /login, passing the current
 * pathname so Login can return the user here on success.
 *
 * When authenticated, renders ``children`` unchanged.
 */
export default function AuthRequired({
  action,
  description,
  unavailable = false,
  children,
}: AuthRequiredProps) {
  const isAuthenticated = useIsAuthenticated();
  const location = useLocation();
  const navigate = useNavigate();

  // Unavailable mode: there is no auth surface in this deployment — these gated
  // routes can never be satisfied. Redirect to the public home rather than
  // showing a Sign-in card that points at a /login route the backend does not
  // mount (it would 404). Fail closed: gated content is never rendered.
  if (unavailable) {
    return <Navigate to="/" replace />;
  }

  if (isAuthenticated) {
    return <>{children}</>;
  }

  const heading = action
    ? `Sign in to ${action}`
    : "Sign in to continue";
  const body =
    description ??
    "This page is for signed-in users. Browsing doesn't require an account — only managing content does.";

  function onSignIn() {
    navigate("/login", {
      replace: false,
      state: { from: location.pathname + location.search },
    });
  }

  return (
    <main className="p-4 sm:p-8">
      <div className="mx-auto max-w-md rounded-xl border bg-card shadow-xs p-8 flex flex-col items-center text-center gap-4">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
          <Lock className="w-5 h-5 text-primary" aria-hidden />
        </div>
        <h1 className="text-lg font-semibold">{heading}</h1>
        <p className="text-sm text-muted-foreground">{body}</p>
        <Button onClick={onSignIn} className="w-full">
          Sign in
        </Button>
      </div>
    </main>
  );
}
