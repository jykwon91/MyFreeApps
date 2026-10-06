import type { CraftPlace } from "@/games/wow-forever/components/crafting/CraftLearnLine";
import { matSummary } from "@/games/wow-forever/crafting/matSources";
import { hasSources } from "@/games/wow-forever/food/recipeSources";
import type { CraftRecipe } from "@/games/wow-forever/types/crafting";

interface CraftFormulaChecklistProps {
  title: string;
  formulas: readonly CraftRecipe[];
  known: ReadonlySet<number>;
  onToggle: (spell: number, known: boolean) => void;
  place: CraftPlace;
}

/** "Skill 110 · Sold by Dalria, Astranaar (limited, 1)" — or that nobody knows where yet. */
function learnLine(recipe: CraftRecipe, place: CraftPlace): string {
  if (recipe.learn.source !== "item") return "";
  const skill = `Skill ${recipe.learn.skill}`;
  const sources = place.sources.recipe(recipe.learn.itemId);
  if (!hasSources(sources)) return `${skill} · Where it's sold isn't known yet`;
  return `${skill} · ${matSummary({ sources, madeBy: null }, place)}`;
}

function formulaName(recipe: CraftRecipe): string {
  if (recipe.learn.source !== "item") return recipe.name;
  return recipe.learn.item;
}

/**
 * Patterns / Formulas you own. Only these join the cheapest route — a recipe
 * you'd have to go and buy isn't "cheapest" until you have it.
 */
export default function CraftFormulaChecklist({ title, formulas, known, onToggle, place }: CraftFormulaChecklistProps) {
  if (!formulas.length) return null;
  return (
    <fieldset className="space-y-1 min-w-0">
      <legend className="text-sm font-medium">{title}</legend>
      <p className="text-xs text-muted-foreground">Tick the ones you've learned. Only these can be picked for the cheapest route.</p>
      <ul className="space-y-1">
        {formulas.map((recipe) => (
          <li key={recipe.spell}>
            <label className="flex items-start gap-3 min-h-[44px] py-1 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 shrink-0"
                checked={known.has(recipe.spell)}
                onChange={(e) => onToggle(recipe.spell, e.target.checked)}
              />
              <span className="min-w-0 break-words">
                <span className="block text-sm">{formulaName(recipe)}</span>
                <span className="block text-xs text-muted-foreground">{learnLine(recipe, place)}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
