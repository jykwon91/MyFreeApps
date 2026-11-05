import { useGetReplyTemplatesQuery } from "@mybookkeeper/api-client/store/inquiriesApi";
import { Banner, EmptyState, LoadingButton, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { WEB_BASE_URL } from "../../constants/api";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { REPLY_TEMPLATE_MESSAGES } from "../../constants/replyTemplates";
import { useOpenLink } from "../inquiries/useOpenLink";
import TransactionFact from "../transactions/TransactionFact";
import { variablesUsed } from "./replyTemplateDisplay";
import ReplyTemplateDetailSkeleton from "./ReplyTemplateDetailSkeleton";

export default function ReplyTemplateDetailScreen({ id }: { id: string }) {
  const { colors, spacing, fontSize } = useTheme();
  const openLink = useOpenLink();
  // The API has no single-template read, so this finds it in the list.
  const { currentData, error, isFetching, refetch } = useGetReplyTemplatesQuery();
  const { refresh, refreshControl } = useRefresh(async () => {
    await refetch();
  }, error);
  const template = currentData?.find((candidate) => candidate.id === id);

  if (!template && (isFetching || (!currentData && !error))) return <ReplyTemplateDetailSkeleton />;
  if (!currentData) {
    return (
      <EmptyState
        action={{ label: REPLY_TEMPLATE_MESSAGES.tryAgain, onPress: refresh }}
        body={REPLY_TEMPLATE_MESSAGES.tryAgainOffer}
        heading={REPLY_TEMPLATE_MESSAGES.couldntLoadOne}
      />
    );
  }
  if (!template) {
    return (
      <EmptyState
        action={{ label: REPLY_TEMPLATE_MESSAGES.back, onPress: () => router.back() }}
        body={REPLY_TEMPLATE_MESSAGES.maybeArchived}
        heading={REPLY_TEMPLATE_MESSAGES.cantFind}
      />
    );
  }

  const variables = variablesUsed(template);
  const labelStyle = { fontSize: fontSize.sm, color: colors.mutedForeground };
  const textStyle = { fontSize: fontSize.md, color: colors.foreground };

  return (
    <ScrollView contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic" refreshControl={refreshControl}>
      {error ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
      <Text accessibilityRole="header" style={{ fontSize: fontSize.xl, fontWeight: "600", color: colors.foreground }}>
        {template.name}
      </Text>
      <View style={{ gap: spacing.xs }}>
        <Text accessibilityRole="header" style={labelStyle}>
          {REPLY_TEMPLATE_MESSAGES.subject}
        </Text>
        <Text selectable style={textStyle}>
          {template.subject_template}
        </Text>
      </View>
      <View style={{ gap: spacing.xs }}>
        <Text accessibilityRole="header" style={labelStyle}>
          {REPLY_TEMPLATE_MESSAGES.message}
        </Text>
        <Text selectable style={textStyle}>
          {template.body_template}
        </Text>
      </View>
      {variables.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <Text accessibilityRole="header" style={{ fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
            {REPLY_TEMPLATE_MESSAGES.variablesHeading}
          </Text>
          {variables.map((variable) => (
            <TransactionFact key={variable.token} label={variable.token} value={variable.fillsIn} />
          ))}
        </View>
      ) : null}
      <View style={{ gap: spacing.sm }}>
        <Text style={labelStyle}>{REPLY_TEMPLATE_MESSAGES.manageOnWebsite}</Text>
        <LoadingButton onPress={() => void openLink(`${WEB_BASE_URL}/reply-templates`)} variant="ghost">
          {REPLY_TEMPLATE_MESSAGES.openWebsite}
        </LoadingButton>
      </View>
    </ScrollView>
  );
}
