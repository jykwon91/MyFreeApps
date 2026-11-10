import type { RequireWriteProps } from "../../types/RequireWriteProps";
import { useWriteAccess } from "./useWriteAccess";
import ViewOnlyState from "./ViewOnlyState";
import WriteAccessSkeleton from "./WriteAccessSkeleton";

/** Wraps a screen that only creates or changes things: a viewer is told why, and nothing inside mounts or fetches for them. */
export default function RequireWrite({ loading, required = true, children, ...viewOnly }: RequireWriteProps) {
  const access = useWriteAccess();
  if (!required || access === "allowed") return <>{children}</>;
  if (access === "loading") return <>{loading ?? <WriteAccessSkeleton />}</>;
  return <ViewOnlyState {...viewOnly} />;
}
