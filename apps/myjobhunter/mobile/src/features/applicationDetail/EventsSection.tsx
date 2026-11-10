import type { ApplicationEvent } from "@myjobhunter/api-client/types/application-event";
import { LoadingButton, useTheme } from "@platform/mobile";
import { useState } from "react";
import { Text, View } from "react-native";
import { APPLICATION_EVENT_MESSAGES as MESSAGES } from "../../constants/applicationEvents";
import type { EventsSectionProps } from "../../types/EventsSectionProps";
import EditInterviewSheet from "./EditInterviewSheet";
import EventCard from "./EventCard";
import LogEventSheet from "./LogEventSheet";
import SectionError from "./SectionError";
import SectionHeading from "./SectionHeading";
import SectionSkeletonCards from "./SectionSkeletonCards";

/** The timeline, newest first, with Log event and an edit for each interview. */
export default function EventsSection({ applicationId, events, isLoading, isError, onRetry }: EventsSectionProps) {
  const { colors, spacing, fontSize } = useTheme();
  const [isLogging, setIsLogging] = useState(false);
  const [editing, setEditing] = useState<ApplicationEvent | null>(null);

  function body() {
    if (isLoading) return <SectionSkeletonCards label={MESSAGES.loading} testID="events-skeleton" />;
    if (!events) return isError ? <SectionError message={MESSAGES.couldntLoad} onRetry={onRetry} retryLabel={MESSAGES.tryAgain} /> : null;
    if (events.length === 0) return <Text style={{ fontSize: fontSize.md, color: colors.mutedForeground }}>{MESSAGES.none}</Text>;
    return events.map((event) => <EventCard event={event} key={event.id} onEdit={setEditing} />);
  }

  return (
    <View style={{ gap: spacing.md }}>
      <SectionHeading count={events?.length} title={MESSAGES.title} />
      <LoadingButton onPress={() => setIsLogging(true)} variant="secondary">
        {MESSAGES.logEvent}
      </LoadingButton>
      {body()}
      {isLogging ? <LogEventSheet applicationId={applicationId} onClose={() => setIsLogging(false)} /> : null}
      {editing ? <EditInterviewSheet applicationId={applicationId} event={editing} key={editing.id} onClose={() => setEditing(null)} /> : null}
    </View>
  );
}
