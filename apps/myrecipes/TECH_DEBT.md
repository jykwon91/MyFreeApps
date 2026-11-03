# MyRecipes Tech Debt

Issues discovered during development. New entries are appended; resolved entries
are removed. Project policy is **log-only** (see `CLAUDE.md` → Tech Debt Policy):
fix only Critical items that block the current feature.

**Open issues: 2 (Critical: 0 / High: 1 / Medium: 1 / Low: 0)**

---

## High

### `FormField` labels are not associated with their inputs

**Where:** `packages/shared-frontend/src/components/ui/FormField.tsx` — a bare
`<label>` with no `htmlFor`, and the control is passed as `children` rather than
nested inside the label. Every consumer inherits the gap: in MyRecipes that is
the whole recipe editor (`RecipeEditorForm.tsx` — Title, Description, Source,
Servings, Prep, Cook, and the change note).

**Impact:** those inputs have no accessible name. A screen reader announces
"edit text, blank" for the recipe title; clicking the visible label does not
focus its field; and `getByLabel(...)` — the locator both Testing Library and
Playwright steer you toward — cannot find them, so tests reach for brittle
attribute selectors instead. Discovered 2026-08-30 while writing an end-to-end
check for the web-discovery save step: `page.getByLabel("Title")` timed out on a
field that is plainly labelled "Title" on screen.

**Fix:** generate an id in `FormField` (`useId()`), put it on the `<label>` as
`htmlFor`, and clone the child with the matching `id` — or wrap the control
inside the `<label>` element. Roughly ten lines.

**Why not now:** `FormField` is a Tier-1 shared primitive used by all five apps,
so the change belongs in its own PR with a sweep of each app's forms, not folded
into a feature PR (one feature per PR). Pre-existing — not introduced by any
recent work here.

## Medium

### The recipe list silently stops at 50

**Where:** `apps/myrecipes/backend` list route (`limit` defaults to 50, max 200,
with `offset`). Neither `apps/myrecipes/frontend/src/pages/Recipes.tsx` nor
`apps/myrecipes/mobile/src/features/recipes/RecipesScreen.tsx` asks for more.

**Impact:** someone with more than 50 recipes can't see the rest, and nothing
says the list was cut short. Search still reaches them.

**Fix:** page through results on both clients (`onEndReached` on mobile).
