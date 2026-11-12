import { LoadingButton } from "@platform/mobile";
import { useRouter } from "expo-router";
import { VERSION_HISTORY_MESSAGES as MESSAGES } from "../../constants/versions";
import { useOpenOnce } from "../../hooks/useOpenOnce";
import type { VersionHistoryButtonProps } from "../../types/VersionHistoryButtonProps";
import { countLabel } from "../../utils/countLabel";

/** Opens the recipe's versions, newest first, for anyone who can see the recipe, as on the website. */
export default function VersionHistoryButton({ recipeId, versionCount }: VersionHistoryButtonProps) {
  const router = useRouter();
  const open = useOpenOnce(() => router.push({ pathname: "/recipes/[id]/versions", params: { id: recipeId } }));

  return (
    <LoadingButton
      accessibilityHint={MESSAGES.openHint(countLabel(versionCount, "version"))}
      onPress={open}
      variant="secondary"
    >
      {MESSAGES.open}
    </LoadingButton>
  );
}
