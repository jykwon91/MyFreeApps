import { LoadingButton } from "@platform/mobile";
import { useRouter } from "expo-router";
import { useSelector } from "react-redux";
import { COOK_TARGET_HEIGHT } from "../../constants/cook";
import { useNowOnResume } from "../../hooks/useNowOnResume";
import { useOpenOnce } from "../../hooks/useOpenOnce";
import type { RootState } from "../../lib/store";
import { resumableCookSession } from "../../utils/resumableCookSession";

export default function StartCookingButton({
  lastPage,
  recipeId,
  versionId,
}: {
  lastPage: number;
  recipeId: string;
  versionId: string;
}) {
  const router = useRouter();
  const now = useNowOnResume();
  const saved = useSelector((state: RootState) => state.cookSessions[recipeId]);
  const session = resumableCookSession(saved, versionId, lastPage, now);
  const hasProgress = !!session && (session.pageIndex > 0 || session.checked.length > 0);

  const open = useOpenOnce(() => router.push({ pathname: "/recipes/[id]/cook", params: { id: recipeId } }));

  return (
    <LoadingButton
      accessibilityHint="Opens full-screen steps and keeps your screen on."
      onPress={open}
      style={{ minHeight: COOK_TARGET_HEIGHT }}
    >
      {hasProgress ? "Resume cooking" : "Start cooking"}
    </LoadingButton>
  );
}
