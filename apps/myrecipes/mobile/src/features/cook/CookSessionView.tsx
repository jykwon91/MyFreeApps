import type { VersionResponse } from "@myrecipes/api-client/types/recipe/version";
import { useAnnouncement, useReduceMotion, useScreenReaderEnabled, useTheme } from "@platform/mobile";
import { useKeepAwake } from "expo-keep-awake";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import PagerView from "react-native-pager-view";
import { useDispatch, useSelector } from "react-redux";
import { COOK_LABEL_MAX_SCALE, COOK_TARGET_HEIGHT } from "../../constants/cook";
import type { RootState } from "../../lib/store";
import { buildCookPages } from "../../utils/buildCookPages";
import { cookNextLabel, cookPageAnnouncement, cookPageTitle } from "../../utils/cookPageText";
import { resumableCookSession } from "../../utils/resumableCookSession";
import CookBarButton from "./CookBarButton";
import CookIngredientList from "./CookIngredientList";
import CookIngredientsSheet from "./CookIngredientsSheet";
import CookStepPage from "./CookStepPage";
import { ingredientToggled, pageChanged, sessionFinished, sessionOpened } from "./cookSessionsSlice";

export default function CookSessionView({
  onExit,
  recipeId,
  title,
  version,
}: {
  onExit: () => void;
  recipeId: string;
  title: string;
  version: VersionResponse;
}) {
  useKeepAwake();
  const { colors, spacing, fontSize } = useTheme();
  const dispatch = useDispatch();
  const reduceMotion = useReduceMotion();
  const isScreenReaderOn = useScreenReaderEnabled();
  const pager = useRef<PagerView>(null);

  const pages = useMemo(() => buildCookPages(version), [version]);
  const lastPage = pages.length - 1;
  const target = { recipeId, versionId: version.id };
  const stored = useSelector((state: RootState) => state.cookSessions[recipeId]);
  const session = stored?.versionId === version.id ? stored : undefined;
  const [initialPage] = useState(() => resumableCookSession(stored, version.id, lastPage, Date.now())?.pageIndex ?? 0);
  const [pageIndex, setPageIndex] = useState(initialPage);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  // Before paint, so a session that's ended never shows its old ticks.
  useLayoutEffect(() => {
    dispatch(sessionOpened({ recipeId, versionId: version.id, lastPage, now: Date.now() }));
  }, [dispatch, lastPage, recipeId, version.id]);

  const checked = session?.checked ?? [];
  const page = pages[pageIndex]!;
  const ingredientCount = version.ingredients.length;
  const isAnimated = reduceMotion === false;
  useAnnouncement(cookPageAnnouncement(page));

  function goTo(index: number): void {
    if (index < 0 || index > lastPage) return;
    if (isAnimated) pager.current?.setPage(index);
    else pager.current?.setPageWithoutAnimation(index);
  }

  function toggleIngredient(ingredientId: string): void {
    dispatch(ingredientToggled({ ...target, ingredientId, now: Date.now() }));
  }

  function finish(): void {
    dispatch(sessionFinished(recipeId));
    onExit();
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <CookBarButton accessibilityLabel="Exit cooking" label="✕" onPress={onExit} />
        <Text
          accessibilityRole="header"
          maxFontSizeMultiplier={COOK_LABEL_MAX_SCALE}
          style={{ color: colors.foreground, fontSize: fontSize.md, fontWeight: "600" }}
        >
          {cookPageTitle(page)}
        </Text>
        {ingredientCount > 0 && page.kind !== "ingredients" ? (
          <CookBarButton
            accessibilityLabel={`Ingredients, ${checked.length} of ${ingredientCount} checked`}
            label={`${checked.length}/${ingredientCount}`}
            onPress={() => setIsSheetOpen(true)}
          />
        ) : (
          <View style={{ minWidth: COOK_TARGET_HEIGHT }} />
        )}
      </View>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ height: 4, backgroundColor: colors.muted }}
      >
        <View
          style={{
            height: 4,
            width: `${lastPage === 0 ? 100 : (pageIndex / lastPage) * 100}%`,
            backgroundColor: colors.foreground,
          }}
          testID="cook-progress"
        />
      </View>
      <PagerView
        initialPage={initialPage}
        onPageSelected={({ nativeEvent: { position } }) => {
          // Both platforms also report the opening page, which isn't a change.
          if (position === pageIndex) return;
          setPageIndex(position);
          dispatch(pageChanged({ ...target, pageIndex: position, now: Date.now() }));
        }}
        overdrag={false}
        ref={pager}
        style={{ flex: 1 }}
        testID="cook-pager"
      >
        {pages.map((item, index) => {
          const isCurrent = index === pageIndex;
          return (
            <View
              accessibilityElementsHidden={!isCurrent}
              collapsable={false}
              importantForAccessibility={isCurrent ? "auto" : "no-hide-descendants"}
              key={item.kind === "step" ? item.id : item.kind}
              style={{ flex: 1 }}
              testID={`cook-page-${index}`}
            >
              {item.kind === "ingredients" ? (
                <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}>
                  <Text style={{ color: colors.foreground, fontSize: fontSize.xl, fontWeight: "700" }}>{title}</Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>
                    Your screen stays on while you cook.
                  </Text>
                  <CookIngredientList
                    checked={checked}
                    ingredients={version.ingredients}
                    onToggle={toggleIngredient}
                  />
                </ScrollView>
              ) : item.kind === "step" ? (
                <CookStepPage
                  areTapZonesEnabled={isScreenReaderOn === false && isCurrent}
                  instruction={item.instruction}
                  onBack={() => goTo(index - 1)}
                  onNext={() => goTo(index + 1)}
                />
              ) : (
                <View style={{ flex: 1, padding: spacing.lg, gap: spacing.sm }}>
                  <Text style={{ color: colors.foreground, fontSize: fontSize.xl, fontWeight: "700" }}>
                    That's everything.
                  </Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: fontSize.md }}>Enjoy your {title}.</Text>
                </View>
              )}
            </View>
          );
        })}
      </PagerView>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          paddingHorizontal: spacing.sm,
          paddingVertical: spacing.xs,
        }}
      >
        <CookBarButton disabled={pageIndex === 0} label="Back" onPress={() => goTo(pageIndex - 1)} />
        <CookBarButton
          isPrimary
          label={cookNextLabel(page, pages[pageIndex + 1])}
          onPress={page.kind === "done" ? finish : () => goTo(pageIndex + 1)}
        />
      </View>
      {isSheetOpen ? (
        <CookIngredientsSheet
          checked={checked}
          ingredients={version.ingredients}
          isAnimated={isAnimated}
          onClose={() => setIsSheetOpen(false)}
          onToggle={toggleIngredient}
        />
      ) : null}
    </View>
  );
}
