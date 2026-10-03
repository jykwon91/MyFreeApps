/**
 * The group planner's page under test (`wowRaidPlanner*.test.tsx`), and what it shows. Each test file mocks the
 * plan's API hooks itself.
 */
import { render, screen, within } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import WowRaidPlannerPage from "@/games/wow-forever/pages/WowRaidPlannerPage";
import { PLANNER_PATH } from "@/test/raidPlanFixtures";

/** The planner at `path`, on a data router — its leave guard needs one. Returns the router, to navigate with. */
export function renderPlanner(path: string = PLANNER_PATH) {
  const router = createMemoryRouter(
    [
      { path: "/wow-forever/raids/:webId/plan", element: <WowRaidPlannerPage /> },
      { path: "/wow-forever/raids/:webId", element: <p>Raid page</p> },
      { path: "/wow-forever", element: <p>WoW Forever home</p> },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

/** Who sits in each of a group's seats, in order — "" for an empty one. */
export function seatsIn(group: string): string[] {
  return within(screen.getByRole("list", { name: group })).getAllByRole("listitem").map(nameIn);
}

/** "Not in a group", in order. */
export function unplacedNames(): string[] {
  const pool = screen.queryByRole("list", { name: "Not in a group" });
  if (pool === null) return [];
  return within(pool).getAllByRole("listitem").map(nameIn);
}

function nameIn(row: HTMLElement): string {
  return row.querySelector('span[title]:not([title="Late"])')?.textContent ?? "";
}
