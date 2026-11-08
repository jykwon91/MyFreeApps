import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useIsAuthenticated } from "@platform/ui";

interface TriageAuthGateProps {
  children: ReactNode;
}

/**
 * Signed out → /login, carrying this exact triage URL (tab, filters, open sheet) in `state.from` so
 * Login returns here. Covers the first visit, Sign out, and a 401 mid-session (the shared API client
 * clears the session on 401, which re-renders this gate). The server's superuser check is the real gate.
 */
export default function TriageAuthGate({ children }: TriageAuthGateProps) {
  const isAuthenticated = useIsAuthenticated();
  const location = useLocation();
  if (isAuthenticated) return children;
  return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
}
