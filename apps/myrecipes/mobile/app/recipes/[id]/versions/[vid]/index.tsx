import VersionScreen from "../../../../../src/features/versions/VersionScreen";
import ValidRoute from "../../../../../src/features/routing/ValidRoute";

export default function VersionRoute() {
  return (
    <ValidRoute uuids={["id", "vid"]}>
      <VersionScreen />
    </ValidRoute>
  );
}
