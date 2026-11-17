import { setFontScale } from "@platform/mobile/test-support/fontScale";
import { render, screen } from "@testing-library/react-native";
import BoardCard from "../src/features/dashboard/BoardCard";
import { kanbanRecord } from "../test-support/kanbanRecord";

const ROLE = "Senior Staff Software Engineer, Payments Infrastructure and Developer Platform";
const COMPANY = "Northwestern Mutual Life Insurance Company of Wisconsin";

async function showCard(): Promise<void> {
  await render(
    <BoardCard isMoving={false} item={kanbanRecord({ id: "app-1", role_title: ROLE, company_name: COMPANY })} now={Date.now()} onMove={() => {}} onOpen={() => {}} />,
  );
}

describe("BoardCard text size", () => {
  it("keeps the role to two lines and the company to one at the default text size", async () => {
    await showCard();

    expect(screen.getByText(ROLE).props.numberOfLines).toBe(2);
    expect(screen.getByText(COMPANY).props.numberOfLines).toBe(1);
  });

  it("shows the whole role and company at a large text size", async () => {
    setFontScale(2);
    await showCard();

    expect(screen.getByText(ROLE).props.numberOfLines).toBeUndefined();
    expect(screen.getByText(COMPANY).props.numberOfLines).toBeUndefined();
  });
});
