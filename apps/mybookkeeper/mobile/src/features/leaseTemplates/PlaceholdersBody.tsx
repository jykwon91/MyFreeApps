import { useGetLeaseTemplateByIdQuery } from "@mybookkeeper/api-client/store/leaseTemplatesApi";
import { Banner, EmptyState, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { PLACEHOLDER_MESSAGES as MESSAGES } from "../../constants/leasePlaceholderEdit";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import type { PlaceholdersBodyProps } from "../../types/PlaceholdersBodyProps";
import { placeholdersInOrder } from "./leaseTemplateDisplay";
import PlaceholderRow from "./PlaceholderRow";

export default function PlaceholdersBody({ template, canWrite }: PlaceholdersBodyProps) {
  const { colors, spacing, fontSize } = useTheme();
  const { error, refetch } = useGetLeaseTemplateByIdQuery(template.id);
  const { refreshControl } = useRefresh(async () => {
    await refetch();
  }, error);
  const rows = placeholdersInOrder(template.placeholders);

  if (rows.length === 0) return <EmptyState body={MESSAGES.emptyBody} heading={MESSAGES.empty} />;
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" refreshControl={refreshControl} testID="lease-template-placeholders">
      <View style={{ gap: spacing.md, padding: spacing.lg }}>
        {error ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{canWrite ? MESSAGES.intro : MESSAGES.introViewOnly}</Text>
      </View>
      {rows.map((placeholder) => (
        <PlaceholderRow key={placeholder.id} onPress={canWrite ? () => router.push(`/lease-templates/${template.id}/placeholders/${placeholder.id}`) : undefined} placeholder={placeholder} />
      ))}
    </ScrollView>
  );
}
