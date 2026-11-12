import { CATALOG_COPY } from "@mylanguagetutor/api-client/constants/catalogCopy";
import { ONBOARDING_COPY } from "@mylanguagetutor/api-client/constants/onboardingCopy";
import { useListLanguagesQuery } from "@mylanguagetutor/api-client/store/catalogApi";
import { onboardingLevelPath } from "@mylanguagetutor/api-client/utils/onboardingLevelPath";
import { Banner, ListSeparator, SHOWING_LAST_LOADED_MESSAGE, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { FlatList, Text, View } from "react-native";
import { CATALOG_MESSAGES, LANGUAGE_SKELETON_ROWS } from "../../constants/catalog";
import CardListSkeleton from "../catalog/CardListSkeleton";
import CatalogCard from "../catalog/CatalogCard";
import CatalogLoadError from "../catalog/CatalogLoadError";
import OnboardingIntro from "./OnboardingIntro";

/** Onboarding step 1: which language to practice. */
export default function LanguageScreen() {
  const { colors, spacing, fontSize } = useTheme();
  const { data: languages, error, isError, refetch } = useListLanguagesQuery();
  const { refresh, isRefreshing, refreshControl } = useRefresh(refetch, error);

  if (!languages && !isError) return <CardListSkeleton accessibilityLabel={CATALOG_MESSAGES.loadingLanguages} rows={LANGUAGE_SKELETON_ROWS} />;

  function renderEmpty() {
    if (isError) return <CatalogLoadError isRetrying={isRefreshing} onRetry={refresh} />;
    return <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>{CATALOG_COPY.noLanguages}</Text>;
  }

  return (
    <FlatList
      ItemSeparatorComponent={ListSeparator}
      ListEmptyComponent={renderEmpty()}
      ListHeaderComponent={
        <View>
          {isError && languages?.length ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} style={{ marginBottom: spacing.md }} /> : null}
          <OnboardingIntro heading={ONBOARDING_COPY.languageHeading} intro={ONBOARDING_COPY.languageIntro} step={ONBOARDING_COPY.languageStep} />
        </View>
      }
      contentContainerStyle={{ flexGrow: 1, padding: spacing.lg }}
      data={languages ?? []}
      keyExtractor={(language) => language.code}
      refreshControl={refreshControl}
      renderItem={({ item }) => (
        <CatalogCard
          detail={item.dialect_label}
          onPress={() => router.push(onboardingLevelPath(item.code))}
          title={item.display_name}
        />
      )}
      style={{ backgroundColor: colors.background }}
      testID="language-list"
    />
  );
}
