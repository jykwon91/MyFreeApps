import { APPLICANT_MINIMUM_AGE_YEARS } from "@mybookkeeper/api-client/constants/applicantPromote";
import type { ApplicantPromoteRequest } from "@mybookkeeper/api-client/types/applicant/applicant-promote-request";
import type { InquiryResponse } from "@mybookkeeper/api-client/types/inquiry/inquiry-response";
import { dateFromIso } from "../../lib/localDate";
import type { PromoteValues } from "../../types/PromoteValues";

export function promoteValuesFrom(inquiry: InquiryResponse): PromoteValues {
  return {
    legalName: inquiry.inquirer_name ?? "",
    dob: null,
    employer: inquiry.inquirer_employer ?? "",
    contractStart: inquiry.desired_start_date ?? inquiry.move_in_date ?? null,
    vehicle: "",
    smoker: "unknown",
    pets: "",
    referredBy: "",
  };
}

function textOrNull(text: string): string | null {
  return text.trim() || null;
}

export function promoteRequest(values: PromoteValues): Omit<ApplicantPromoteRequest, "today"> {
  return {
    legal_name: textOrNull(values.legalName),
    dob: values.dob,
    employer_or_hospital: textOrNull(values.employer),
    contract_start: values.contractStart,
    vehicle_make_model: textOrNull(values.vehicle),
    smoker: values.smoker === "unknown" ? null : values.smoker === "yes",
    pets: textOrNull(values.pets),
    referred_by: textOrNull(values.referredBy),
  };
}

/** The same birthday arithmetic the server uses, so the form can't accept what it would refuse. */
export function isOldEnough(dob: string, today: Date): boolean {
  const birth = dateFromIso(dob);
  const hadBirthday =
    today.getMonth() > birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
  return today.getFullYear() - birth.getFullYear() - (hadBirthday ? 0 : 1) >= APPLICANT_MINIMUM_AGE_YEARS;
}
