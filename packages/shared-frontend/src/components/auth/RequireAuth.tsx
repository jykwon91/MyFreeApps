import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useIsAuthenticated } from "@/shared/lib/auth-store";

interface Props {
  children: ReactNode;
  redirectTo?: string;
}

export default function RequireAuth({ children, redirectTo = "/login" }: Props) {
  const isAuth = useIsAuthenticated();
  const location = useLocation();

  if (!isAuth) {
    return (
      <Navigate
        to={redirectTo}
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }

  return <>{children}</>;
}
