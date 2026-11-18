import VersionDiffScreen from "../../../../../src/features/versions/VersionDiffScreen";
import ValidRoute from "../../../../../src/features/routing/ValidRoute";

export default function VersionDiffRoute() {
  return (
    <ValidRoute uuids={["id", "vid"]}>
      <VersionDiffScreen />
    </ValidRoute>
  );
}
