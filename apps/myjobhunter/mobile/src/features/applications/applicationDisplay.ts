import type { Application } from "@myjobhunter/api-client/types/application";
import { formatAppliedDate } from "@myjobhunter/api-client/utils/formatAppliedDate";
import { formatEventType } from "@myjobhunter/api-client/utils/formatEventType";
import { formatFitScore } from "@myjobhunter/api-client/utils/formatFitScore";
import { formatRemoteType } from "@myjobhunter/api-client/utils/formatRemoteType";
import { APPLICATION_MESSAGES } from "../../constants/applications";

export function companyName(application: Application): string {
  return application.company_name ?? APPLICATION_MESSAGES.unknownCompany;
}

export function statusLabel(application: Application): string | null {
  return application.latest_status === null ? null : formatEventType(application.latest_status);
}

export function fitText(application: Application): string | null {
  const fit = formatFitScore(application.fit_score);
  return fit === null ? null : `${fit} ${APPLICATION_MESSAGES.fit}`;
}

function appliedText(application: Application): string | null {
  const applied = formatAppliedDate(application.applied_at);
  return applied === null ? null : `${APPLICATION_MESSAGES.applied} ${applied}`;
}

/** Where, how remote and when, leaving out whatever the application doesn't say. Null if none of it. */
export function applicationDetails(application: Application): string | null {
  const parts = [application.location, formatRemoteType(application.remote_type), appliedText(application)].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Everything the row shows, in the order it shows it, for a screen reader. */
export function applicationRowLabel(application: Application): string {
  return [
    companyName(application),
    application.role_title,
    fitText(application),
    application.location,
    formatRemoteType(application.remote_type),
    appliedText(application),
    statusLabel(application),
  ]
    .filter((part): part is string => Boolean(part))
    .join(", ");
}
