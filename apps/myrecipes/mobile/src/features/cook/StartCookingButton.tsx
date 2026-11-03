import { LoadingButton } from "@platform/mobile";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef } from "react";
import { useSelector } from "react-redux";
import { COOK_TARGET_HEIGHT } from "../../constants/cook";
import { useNowOnResume } from "../../hooks/useNowOnResume";
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
  const isOpening = useRef(false);
  const saved = useSelector((state: RootState) => state.cookSessions[recipeId]);
  const session = resumableCookSession(saved, versionId, lastPage, now);
  const hasProgress = !!session && (session.pageIndex > 0 || session.checked.length > 0);

  useFocusEffect(
    useCallback(() => {
      isOpening.current = false;
    }, []),
  );

  function open(): void {
    if (isOpening.current) return;
    isOpening.current = true;
    router.push({ pathname: "/recipes/[id]/cook", params: { id: recipeId } });
  }

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
