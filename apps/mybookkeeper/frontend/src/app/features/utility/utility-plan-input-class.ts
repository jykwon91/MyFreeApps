/**
 * The one input styling the utility-plan dialogs share.
 *
 * Its own module rather than an export off ``UtilityPlanFormFields`` so the
 * field components that make up that form can use it without importing their
 * own parent — a cycle that only grows as the form is split further.
 */
// ``min-h-[44px]`` is the touch target, not decoration: px-3/py-2 at text-sm
// renders about 36px, which is under the minimum on a phone — and this dialog
// is mostly used on one.
export const UTILITY_PLAN_INPUT_CLASS =
  "w-full min-h-[44px] px-3 py-2 text-sm border rounded-md";
