/**
 * react-hook-form resolver for the add-application review form. Uses the
 * shared addApplicationFormProblems check (the phone uses the same one), so
 * the form is validated against the trimmed values that are sent — a
 * whitespace-only role title is caught inline rather than by the API.
 */
import { addApplicationFormProblems } from "@myjobhunter/api-client/utils/addApplicationFormProblems";
import { problemsResolver } from "@/lib/problems-resolver";

export const addApplicationFormResolver = problemsResolver(addApplicationFormProblems);
