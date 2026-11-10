import { useGetWelcomeManualByIdQuery } from "@mybookkeeper/api-client/store/welcomeManualsApi";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { Banner, EmptyState, SHOWING_LAST_LOADED_MESSAGE, useRefresh } from "@platform/mobile";
import { View } from "react-native";
import { WELCOME_MANUAL_MESSAGES } from "../../constants/welcomeManuals";
import { goBackOr } from "../../lib/goBackOr";
import type { WelcomeManualLoaderProps } from "../../types/WelcomeManualLoaderProps";
import WelcomeManualDetailSkeleton from "./WelcomeManualDetailSkeleton";

/** Loads one manual for a screen and covers the loading, gone, failed cases the same way everywhere. */
export default function WelcomeManualContent({ id, isLeaving = false, children }: Omit<WelcomeManualLoaderProps, "requireWrite">) {
  const { currentData: manual, error, isFetching, refetch } = useGetWelcomeManualByIdQuery(id);
  const { refresh, refreshControl } = useRefresh(async () => {
    await refetch();
  }, error);

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
