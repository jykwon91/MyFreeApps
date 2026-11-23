import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useIsAuthenticated } from "../../lib/auth-store";
import type { RequireAuthLocationState } from "../../types/require-auth-location-state";

interface Props {
  children: ReactNode;
  redirectTo?: string;
}

export default function RequireAuth({ children, redirectTo = "/login" }: Props) {
  const isAuth = useIsAuthenticated();
  const location = useLocation();
  const state: RequireAuthLocationState = { from: location.pathname + location.search };

  if (!isAuth) {
    return (
      <Navigate
        to={redirectTo}
        replace
        state={state}
      />
    );
  }

  return <>{children}</>;
}
