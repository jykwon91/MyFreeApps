import { PRACTICE_COPY } from "@mylanguagetutor/api-client/constants/practiceCopy";
import { usePracticeScenario } from "@mylanguagetutor/api-client/hooks/usePracticeScenario";
import { EmptyState, useRefresh } from "@platform/mobile";
import { router } from "expo-router";
import { PRACTICE_PATH } from "../../constants/routes";
import type { ConversationLoaderProps } from "../../types/ConversationLoaderProps";
import CatalogLoadError from "../catalog/CatalogLoadError";
import Conversation from "./Conversation";
import ConversationSkeleton from "./ConversationSkeleton";

/** Finds the language and scenario to practice, then starts the conversation, as the website's practice page does. */
export default function ConversationLoader({ profile, scenarioSlug }: ConversationLoaderProps) {
  const { target, isError, error, refetch } = usePracticeScenario(profile, scenarioSlug);
  const { refresh, isRefreshing } = useRefresh(refetch, error);

  // A failed background refetch must not unmount a conversation already on screen, so errors only show with no target yet.
  if (target === undefined) {
    return isError ? <CatalogLoadError isRetrying={isRefreshing} onRetry={refresh} /> : <ConversationSkeleton />;
  }
  if (!target) {
    return (
      <EmptyState
        action={{ label: PRACTICE_COPY.seeScenarios, onPress: () => router.dismissTo(PRACTICE_PATH) }}
        body={PRACTICE_COPY.scenarioNotFoundBody}
        heading={PRACTICE_COPY.scenarioNotFound}
      />
    );
  }

  const { language, scenario } = target;
  return (
    <Conversation
      key={`${language.code}:${scenario.slug}:${profile.level}`}
      language={language}
      level={profile.level}
      scenario={scenario}
    />
  );
}
