import { DISCOVERY_READ_STAGES, DISCOVERY_STAGE_SECONDS } from "@myrecipes/api-client/constants/discovery";
import { render, screen } from "@testing-library/react-native";
import DiscoveryStatus from "../src/features/discovery/DiscoveryStatus";
import reducer, { discoveryCleared, recipeSaved } from "../src/features/discovery/discoverySlice";

describe("DiscoveryStatus", () => {
  it("shows the stage the wait has reached, even after time away, and stops at the last", async () => {
    const step = DISCOVERY_STAGE_SECONDS * 1000;
    const view = await render(<DiscoveryStatus stages={DISCOVERY_READ_STAGES} startedAt={Date.now() - step - 1} />);
    expect(screen.getByText(DISCOVERY_READ_STAGES[1])).toBeTruthy();

    await view.rerender(<DiscoveryStatus stages={DISCOVERY_READ_STAGES} startedAt={Date.now() - step * 10} />);
    expect(screen.getByText(DISCOVERY_READ_STAGES[2])).toBeTruthy();
  });
});

describe("discoverySlice", () => {
  it("drops a save from an account that has left, and keeps one from this account", () => {
    const started = reducer(undefined, { type: "init" });
    const cleared = reducer(started, discoveryCleared());

    const stale = reducer(cleared, recipeSaved({ resultId: "flan1", recipeId: "r1", generation: started.generation }));
    expect(stale.saved).toEqual({});
    const current = reducer(cleared, recipeSaved({ resultId: "flan1", recipeId: "r2", generation: cleared.generation }));
    expect(current.saved).toEqual({ flan1: "r2" });
  });
});
