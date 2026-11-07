import { useState } from "react";
import { NavLink, type NavLinkRenderProps } from "react-router-dom";
import { LogOut } from "lucide-react";
import { LoadingButton } from "@platform/ui";
import { SERVE_ONLY_OPERATOR_LINKS } from "@/constants/serveOnlyOperator";
import { signOutAfterSaving } from "@/lib/auth";

const LINK_CLASS = "inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium";

function linkClass({ isActive }: NavLinkRenderProps): string {
  return `${LINK_CLASS} ${isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`;
}

/**
 * The signed-in operator's header on a serve-only build: Triage, Two-factor and Sign out — nothing else,
 * because serve-only mounts no other signed-in API. The public nav and guest shell stay as they are.
 */
export default function ServeOnlyOperatorActions() {
  const [signingOut, setSigningOut] = useState(false);

  function signOut() {
    setSigningOut(true);
    void signOutAfterSaving().finally(() => setSigningOut(false));
  }

  return (
    <nav aria-label="Operator" className="flex items-center gap-1" data-testid="serve-only-operator-actions">
      {SERVE_ONLY_OPERATOR_LINKS.map((link) => (
        <NavLink key={link.path} to={link.path} className={linkClass}>
          {link.label}
        </NavLink>
      ))}
      <LoadingButton
        type="button"
        variant="secondary"
        size="sm"
        onClick={signOut}
        isLoading={signingOut}
        loadingText="Signing out…"
        className="gap-1.5 min-h-11 sm:min-h-11"
      >
        <LogOut size={14} aria-hidden />
        Sign out
      </LoadingButton>
    </nav>
  );
}
