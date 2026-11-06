import type { SubmissionContext } from "@/games/wow-forever/types/featureRequests/submissionContext";
import type { SubmitFeatureRequestBody } from "@/games/wow-forever/types/featureRequests/submitFeatureRequestBody";

/** The "about you" answers that were actually given, or undefined when none were (the field is left out). */
export function givenContext(context: SubmissionContext): SubmissionContext | undefined {
  const given: SubmissionContext = {};
  if (context.class_id !== undefined) given.class_id = context.class_id;
  if (context.experience !== undefined) given.experience = context.experience;
  if (context.level_band !== undefined) given.level_band = context.level_band;
  if (context.faction !== undefined) given.faction = context.faction;
  if (context.professions !== undefined && context.professions.length > 0) given.professions = [...context.professions];
  if (context.activities !== undefined && context.activities.length > 0) given.activities = [...context.activities];
  return Object.keys(given).length === 0 ? undefined : given;
}

/** A first send of an idea. */
export function ideaBody(text: string, clientId: string, context: SubmissionContext): SubmitFeatureRequestBody {
  const body: SubmitFeatureRequestBody = { text: text.trim(), client_id: clientId };
  const given = givenContext(context);
  if (given !== undefined) body.context = given;
  return body;
}

/**
 * The answer to a clarifying question: the same idea plus the answer, linked to the first submission.
 * An empty answer is "Skip, submit as is" — the server then takes its best reading of the idea.
 */
export function answerBody(
  text: string,
  clientId: string,
  context: SubmissionContext,
  parentSubmissionId: string,
  answer: string,
): SubmitFeatureRequestBody {
  return { ...ideaBody(text, clientId, context), parent_submission_id: parentSubmissionId, clarification_answer: answer.trim() };
}
