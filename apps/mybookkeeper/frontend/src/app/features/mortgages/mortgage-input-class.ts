/**
 * The one input styling the mortgage dialogs share.
 *
 * Its own module rather than an export off ``MortgageFormFields`` so the
 * document reader can take it without importing the form it has nothing else
 * to do with.
 */
// ``min-h-[44px]`` is the touch target, not decoration: px-3/py-2 at text-sm
// renders about 36px, which is under the minimum on a phone.
export const MORTGAGE_INPUT_CLASS =
  "w-full min-h-[44px] px-3 py-2 text-sm border rounded-md";
