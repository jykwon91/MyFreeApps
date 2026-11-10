import { EmptyState } from "@platform/mobile";
import { FORM_MESSAGES } from "../../constants/forms";
import type { ViewOnlyStateProps } from "../../types/ViewOnlyStateProps";

/** What a viewer sees in place of a screen that only creates or changes things. */
export default function ViewOnlyState({ heading = FORM_MESSAGES.viewOnlyHeading, body = FORM_MESSAGES.viewOnlyBody, action }: ViewOnlyStateProps) {
  return <EmptyState action={action} body={body} heading={heading} />;
}
