/**
 * The one input styling the utility-plan dialogs share.
 *
 * Its own module rather than an export off ``UtilityPlanFormFields`` so the
 * field components that make up that form can use it without importing their
 * own parent — a cycle that only grows as the form is split further.
 */
export const UTILITY_PLAN_INPUT_CLASS = "w-full px-3 py-2 text-sm border rounded-md";
