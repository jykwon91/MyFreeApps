import CookScreen from "../../../src/features/cook/CookScreen";
import ValidRoute from "../../../src/features/routing/ValidRoute";

export default function CookRoute() {
  return (
    <ValidRoute uuids={["id"]}>
      <CookScreen />
    </ValidRoute>
  );
}
