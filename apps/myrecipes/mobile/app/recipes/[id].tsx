import RecipeDetailScreen from "../../src/features/recipes/RecipeDetailScreen";
import ValidRoute from "../../src/features/routing/ValidRoute";

export default function RecipeRoute() {
  return (
    <ValidRoute uuids={["id"]}>
      <RecipeDetailScreen />
    </ValidRoute>
  );
}
