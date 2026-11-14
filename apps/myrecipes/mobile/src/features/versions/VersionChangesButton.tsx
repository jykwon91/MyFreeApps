import { LoadingButton } from "@platform/mobile";
import { useRouter } from "expo-router";
import { VERSION_VIEW_ENTRY_POINT, VERSION_VIEW_MESSAGES as MESSAGES } from "../../constants/versions";
import { useOpenOnce } from "../../hooks/useOpenOnce";
import type { VersionChangesButtonProps } from "../../types/VersionChangesButtonProps";

/** Opens what changed in this version from the one it was based on. Two quick taps open it once. */
export default function VersionChangesButton({ recipeId, versionId }: VersionChangesButtonProps) {
  const router = useRouter();
  const open = useOpenOnce(() =>
    router.push({
      pathname: "/recipes/[id]/versions/[vid]/diff",
      params: { id: recipeId, vid: versionId, from: VERSION_VIEW_ENTRY_POINT },
    }),
  );

  return (
    <LoadingButton accessibilityHint={MESSAGES.changesHint} onPress={open} variant="secondary">
      {MESSAGES.changes}
    </LoadingButton>
  );
}
