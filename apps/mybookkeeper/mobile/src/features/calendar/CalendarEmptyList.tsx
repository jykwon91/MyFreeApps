import { EmptyState } from "@platform/mobile";
import { WEB_BASE_URL } from "../../constants/api";
import { CALENDAR_MESSAGES } from "../../constants/calendar";
import { useOpenLink } from "../inquiries/useOpenLink";
import { emptyMonthHeading } from "./calendarDisplay";
import CalendarSkeleton from "./CalendarSkeleton";

interface CalendarEmptyListProps {
  isLoading: boolean;
  hasFailed: boolean;
  hasNoListings: boolean;
  month: string;
  onRetry: () => void;
}

export default function CalendarEmptyList({ isLoading, hasFailed, hasNoListings, month, onRetry }: CalendarEmptyListProps) {
  const openLink = useOpenLink();
  if (isLoading) return <CalendarSkeleton />;
  if (hasFailed) {
    return (
      <EmptyState
        action={{ label: CALENDAR_MESSAGES.tryAgain, onPress: onRetry }}
        body={CALENDAR_MESSAGES.checkConnection}
        heading={CALENDAR_MESSAGES.couldntLoad}
      />
    );
  }
  if (hasNoListings) {
    return (
      <EmptyState
        action={{ label: CALENDAR_MESSAGES.openWebsite, onPress: () => void openLink(`${WEB_BASE_URL}/listings`) }}
        body={CALENDAR_MESSAGES.noListingsBody}
        heading={CALENDAR_MESSAGES.noListingsHeading}
      />
    );
  }
  return <EmptyState body={CALENDAR_MESSAGES.emptyMonthBody} heading={emptyMonthHeading(month)} />;
}
