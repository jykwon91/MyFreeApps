import type { StoryText } from "@/games/wow-forever/types/featureRequests/storyText";

/** A brand-new story straight from the refiner: private until triage approves it. */
export interface RefinedStory extends StoryText {
  status: "submitted";
}
