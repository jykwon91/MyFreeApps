import { useGetWelcomeManualByIdQuery } from "@mybookkeeper/api-client/store/welcomeManualsApi";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { Banner, EmptyState, useRefresh } from "@platform/mobile";
import type { ReactNode } from "react";
import { View } from "react-native";
import { FORM_MESSAGES } from "../../constants/forms";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { WELCOME_MANUAL_MESSAGES } from "../../constants/welcomeManuals";
import { goBackOr } from "../../lib/goBackOr";
import type { WelcomeManualView } from "../../types/WelcomeManualView";
import { useCanWrite } from "../workspace/useCanWrite";
import WelcomeManualDetailSkeleton from "./WelcomeManualDetailSkeleton";

interface WelcomeManualLoaderProps {
  id: string;
  /** For the screens that change things: a viewer is told, not shown a form that can't save. */
  requireWrite?: boolean;
  /** The screen is on its way out after a delete, so the manual vanishing isn't an error to show. */
  isLeaving?: boolean;
  children: (view: WelcomeManualView) => ReactNode;
}

/** Loads one manual for a screen and covers the loading, gone, failed and view-only cases the same way everywhere. */
export default function WelcomeManualLoader({ id, requireWrite = false, isLeaving = false, children }: WelcomeManualLoaderProps) {
  const canWrite = useCanWrite();
  const { currentData: manual, error, isFetching, refetch } = useGetWelcomeManualByIdQuery(id);
  const { refresh, refreshControl } = useRefresh(async () => {
    await refetch();
  }, error);

  if (requireWrite && !canWrite) return <EmptyState body={FORM_MESSAGES.viewOnlyBody} heading={FORM_MESSAGES.viewOnlyHeading} />;
  if (isLeaving || (!manual && (isFetching || !error))) return <WelcomeManualDetailSkeleton />;
  // A manual deleted elsewhere has nothing left to show, even if a copy is still in memory.
  const isGone = httpStatus(error) === 404;
  if (!manual || isGone) {
    return (
      <EmptyState
        action={isGone ? { label: WELCOME_MANUAL_MESSAGES.back, onPress: () => goBackOr("/welcome-manuals") } : { label: WELCOME_MANUAL_MESSAGES.tryAgain, onPress: refresh }}
        body={isGone ? WELCOME_MANUAL_MESSAGES.maybeDeleted : WELCOME_MANUAL_MESSAGES.tryAgainOffer}
        heading={isGone ? WELCOME_MANUAL_MESSAGES.cantFind : WELCOME_MANUAL_MESSAGES.couldntLoadOne}
      />
    );
  }
  return (
    <View style={{ flex: 1 }}>
      {error ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
      {children({ manual, refreshControl })}
    </View>
  );
}
