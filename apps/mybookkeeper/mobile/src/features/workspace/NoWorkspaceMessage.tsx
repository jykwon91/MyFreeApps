import { useState } from "react";
import { WORKSPACE_MESSAGES as MESSAGES } from "../../constants/workspace";
import CreateWorkspaceSheet from "./CreateWorkspaceSheet";
import { useCreateWorkspace } from "./useCreateWorkspace";
import WorkspaceMessage from "./WorkspaceMessage";

/** Someone in no workspace can still make their own here; once it's made, the gate lets them in. */
export default function NoWorkspaceMessage() {
  const [isCreating, setIsCreating] = useState(false);
  const createWorkspace = useCreateWorkspace();

  return (
    <>
      <WorkspaceMessage
        action={{ label: MESSAGES.createFirst, onPress: () => setIsCreating(true) }}
        body={MESSAGES.noWorkspaceBody}
        heading={MESSAGES.noWorkspaceHeading}
      />
      {isCreating ? <CreateWorkspaceSheet onClose={() => setIsCreating(false)} onCreate={createWorkspace} /> : null}
    </>
  );
}
