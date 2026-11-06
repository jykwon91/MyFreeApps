import TriageEditSheet from "@/games/wow-forever/components/featureRequests/triage/TriageEditSheet";
import TriageMergeSheet from "@/games/wow-forever/components/featureRequests/triage/TriageMergeSheet";
import TriageNotPlannedSheet from "@/games/wow-forever/components/featureRequests/triage/TriageNotPlannedSheet";
import TriageSheetGone from "@/games/wow-forever/components/featureRequests/triage/TriageSheetGone";
import TriageShippedSheet from "@/games/wow-forever/components/featureRequests/triage/TriageShippedSheet";
import { useGetTriageInboxQuery, useGetTriageStoriesQuery } from "@/games/wow-forever/api/triageApi";
import { TRIAGE_COPY } from "@/games/wow-forever/data/featureRequests/triage/triageCopy";
import {
  findInboxItem,
  findInboxItemForStory,
  findTriageStory,
} from "@/games/wow-forever/lib/featureRequests/triage/triageStoryLookup";
import type { TriageActions } from "@/games/wow-forever/types/featureRequests/triage/triageActions";
import type { TriageOpenSheet } from "@/games/wow-forever/types/featureRequests/triage/triageOpenSheet";
import type { TriageTab } from "@/games/wow-forever/types/featureRequests/triage/triageTab";

interface TriageSheetsProps {
  sheet: TriageOpenSheet | null;
  tab: TriageTab;
  actions: TriageActions;
  onClose: () => void;
}

/** The open sheet (from the URL), with its story looked up in the cached inbox and story list. */
export default function TriageSheets({ sheet, tab, actions, onClose }: TriageSheetsProps) {
  const inbox = useGetTriageInboxQuery();
  const stories = useGetTriageStoriesQuery(undefined, { skip: sheet === null });
  if (sheet === null) return null;

  const story = findTriageStory(sheet.storyId, inbox.data, stories.data);
  if (story === null) {
    return stories.isLoading ? null : <TriageSheetGone onClose={onClose} />;
  }
  const inboxItem = tab === "inbox" ? findInboxItemForStory(inbox.data, story.id) : null;

  if (sheet.kind === "edit") {
    const from = findInboxItem(inbox.data, sheet.fromSubmissionId);
    return (
      <TriageEditSheet
        key={story.id}
        story={story}
        extraLine={from?.nuance_note ?? null}
        onClose={onClose}
        onSave={(patch) => actions.saveStory(story, patch, TRIAGE_COPY.toastSaved)}
      />
    );
  }
  if (sheet.kind === "merge") {
    if (inboxItem === null) return <TriageSheetGone onClose={onClose} />;
    return <TriageMergeSheet source={story} onClose={onClose} onMerge={(target) => actions.mergeFromInbox(inboxItem, story, target)} />;
  }
  if (sheet.kind === "shipped") {
    return (
      <TriageShippedSheet
        story={story}
        onClose={onClose}
        onSave={(path) => actions.saveStory(story, { status: "shipped", shipped_path: path }, TRIAGE_COPY.toastShipped)}
      />
    );
  }
  return (
    <TriageNotPlannedSheet
      story={story}
      onClose={onClose}
      onSubmit={(note) => {
        if (inboxItem !== null) {
          actions.declineFromInbox(inboxItem, story, note);
          return Promise.resolve(null);
        }
        return actions.saveStory(story, { status: "not_planned", operator_note: note }, TRIAGE_COPY.toastNotPlanned);
      }}
    />
  );
}
