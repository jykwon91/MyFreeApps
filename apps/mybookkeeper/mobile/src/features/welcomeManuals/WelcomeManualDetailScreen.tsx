import { useGetPropertiesQuery } from "@mybookkeeper/api-client/store/propertiesApi";
import { useGetWelcomeManualByIdQuery } from "@mybookkeeper/api-client/store/welcomeManualsApi";
import { Banner, EmptyState, LoadingButton, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { WEB_BASE_URL } from "../../constants/api";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { WELCOME_MANUAL_MESSAGES } from "../../constants/welcomeManuals";
import { plainFromMarkdown } from "../../lib/plainFromMarkdown";
import { useOpenLink } from "../inquiries/useOpenLink";
import { httpStatus } from "../transactions/transactionMessages";
import { manualPropertyName } from "./welcomeManualDisplay";
import WelcomeManualDetailSkeleton from "./WelcomeManualDetailSkeleton";
import WelcomeManualPlace from "./WelcomeManualPlace";
import WelcomeManualSection from "./WelcomeManualSection";
import WelcomeManualShare from "./WelcomeManualShare";

export default function WelcomeManualDetailScreen({ id }: { id: string }) {
  const { colors, spacing, fontSize } = useTheme();
  const openLink = useOpenLink();
  const { currentData: manual, error, isFetching, refetch } = useGetWelcomeManualByIdQuery(id);
  const { currentData: properties } = useGetPropertiesQuery();
  const { refresh, refreshControl } = useRefresh(async () => {
    await refetch();
  }, error);

  if (!manual && (isFetching || !error)) return <WelcomeManualDetailSkeleton />;
  // A manual deleted on the website has a dead share link, so the copy still in memory can't be offered.
  const isGone = httpStatus(error) === 404;
  if (!manual || isGone) {
    return (
      <EmptyState
        action={isGone ? { label: WELCOME_MANUAL_MESSAGES.back, onPress: () => router.back() } : { label: WELCOME_MANUAL_MESSAGES.tryAgain, onPress: refresh }}
        body={isGone ? WELCOME_MANUAL_MESSAGES.maybeDeleted : WELCOME_MANUAL_MESSAGES.tryAgainOffer}
        heading={isGone ? WELCOME_MANUAL_MESSAGES.cantFind : WELCOME_MANUAL_MESSAGES.couldntLoadOne}
      />
    );
  }

  const propertyName = manualPropertyName(manual.property_id, properties);

  return (
    <ScrollView contentContainerStyle={{ gap: spacing.xl, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic" refreshControl={refreshControl}>
      {error ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
      <View style={{ gap: spacing.xs }}>
        <Text accessibilityRole="header" style={{ fontSize: fontSize.xl, fontWeight: "600", color: colors.foreground }}>
          {manual.title}
        </Text>
        {propertyName ? <Text style={{ fontSize: fontSize.md, color: colors.mutedForeground }}>{propertyName}</Text> : null}
      </View>
      {manual.intro_text ? (
        <Text selectable style={{ fontSize: fontSize.md, color: colors.foreground }}>
          {plainFromMarkdown(manual.intro_text)}
        </Text>
      ) : null}
      <WelcomeManualShare pin={manual.share_pin} token={manual.share_token} />
      {manual.sections.length === 0 ? (
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{WELCOME_MANUAL_MESSAGES.noSections}</Text>
      ) : (
        manual.sections.map((section) => (
          <WelcomeManualSection key={section.id} roomName={manual.rooms.find((room) => room.id === section.room_id)?.name ?? null} section={section} />
        ))
      )}
      {manual.places.length > 0 ? (
        <View style={{ gap: spacing.md }}>
          <Text accessibilityRole="header" style={{ fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
            {WELCOME_MANUAL_MESSAGES.whereToEat}
          </Text>
          {manual.places.map((place) => (
            <WelcomeManualPlace key={place.id} place={place} />
          ))}
        </View>
      ) : null}
      <View style={{ gap: spacing.sm }}>
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{WELCOME_MANUAL_MESSAGES.manageOnWebsite}</Text>
        <LoadingButton onPress={() => void openLink(`${WEB_BASE_URL}/welcome-manuals/${manual.id}`)} variant="ghost">
          {WELCOME_MANUAL_MESSAGES.openWebsite}
        </LoadingButton>
      </View>
    </ScrollView>
  );
}
