import type { ApplicationDetail } from "@myjobhunter/api-client/types/application-detail";
import { applicationRecord } from "./applicationRecord";

/** An application as GET /applications/{id} returns it, with its timeline and contacts. */
export function applicationDetailRecord(overrides: Partial<ApplicationDetail> & Pick<ApplicationDetail, "id">): ApplicationDetail {
  const { events = [], contacts = [], ...application } = overrides;
  return { ...applicationRecord({ company_name: null, latest_status: null, ...application }), events, contacts };
}
