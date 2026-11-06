# MyRecipes Tech Debt

Issues discovered during development. New entries are appended; resolved entries
are removed. Project policy is **log-only** (see `CLAUDE.md` → Tech Debt Policy):
fix only Critical items that block the current feature.

**Open issues: 1 (Critical: 0 / High: 0 / Medium: 1 / Low: 0)**

---

## Medium

### The recipe list silently stops at 50

**Where:** `apps/myrecipes/backend` list route (`limit` defaults to 50, max 200,
with `offset`). Neither `apps/myrecipes/frontend/src/pages/Recipes.tsx` nor
`apps/myrecipes/mobile/src/features/recipes/RecipesScreen.tsx` asks for more.

**Impact:** someone with more than 50 recipes can't see the rest, and nothing
says the list was cut short. Search still reaches them.

**Fix:** page through results on both clients (`onEndReached` on mobile).
