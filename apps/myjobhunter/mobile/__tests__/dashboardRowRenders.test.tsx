import { baseApi } from "@platform/core/store/baseApi";
import { fireEvent, screen } from "@testing-library/react-native";
import { APPLICATION_DETAIL_MESSAGES as DETAIL } from "../src/constants/applicationDetail";
import { DASHBOARD_MESSAGES as MESSAGES } from "../src/constants/dashboard";
import { store } from "../src/lib/store";
import { serve } from "@platform/mobile/test-support/fakeServer";
import { kanbanRecord } from "../test-support/kanbanRecord";
import { renderApp } from "../test-support/renderApp";
import { storeSession, tokens } from "@platform/mobile/test-support/storedSession";
import type { FakeReply } from "@platform/mobile/test-support/types/FakeReply";

jest.mock("expo-secure-store", () => jest.requireActual("@platform/mobile/test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("@platform/mobile/test-support/fakeApplication"));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);
jest.mock("expo-crypto", () => ({ randomUUID: jest.fn(() => "move-key-1") }));

// Counts every draw of a card, whichever card it is.
const mockCardRenders = jest.fn();
jest.mock("../src/features/dashboard/BoardCard", () => {
  const actual = jest.requireActual("../src/features/dashboard/BoardCard");
  return {
    __esModule: true,
    default: (props: { item: { id: string } }) => {
      mockCardRenders(props.item.id);
      return actual.default(props);
    },
  };
});

const BOARD = "GET /applications?view=kanban";
const ITEMS = [
  kanbanRecord({ id: "app-stripe", role_title: "Staff Engineer", company_name: "Stripe", latest_event_type: "applied" }),
  kanbanRecord({ id: "app-lyft", role_title: "Principal Engineer", company_name: "Lyft", latest_event_type: "interview_scheduled" }),
];
const refreshed = (): FakeReply => ({ status: 200, data: tokens(1) });
const board = (): FakeReply => ({ status: 200, data: { items: ITEMS, total: ITEMS.length } });

const ROW_WIDTH = 400;
const ROW_HEIGHT = 60;
const TALL_SCREEN = 10000;

function measurableRows() {
  return screen.getByTestId("dashboard-list").queryAll((node) => typeof node.props.onLayout === "function");
}

// The list draws only a first screenful until it is measured; this gives it a phone tall enough for the board.
async function showWholeBoard(): Promise<void> {
  const list = screen.getByTestId("dashboard-list");
  await fireEvent(list, "layout", { nativeEvent: { layout: { x: 0, y: 0, width: ROW_WIDTH, height: TALL_SCREEN } } });
  for (const [index, row] of measurableRows().entries()) {
    await fireEvent(row, "layout", { nativeEvent: { layout: { x: 0, y: index * ROW_HEIGHT, width: ROW_WIDTH, height: ROW_HEIGHT } } });
  }
}

beforeEach(() => {
  storeSession();
  jest.clearAllMocks();
  store.dispatch(baseApi.util.resetApiState());
});

it("doesn't draw the cards again when the screen's own state changes, such as opening the move sheet", async () => {
  serve({ "POST /auth/mobile/refresh": refreshed, [BOARD]: board });
  await renderApp();
  await screen.findByRole("header", { name: MESSAGES.summaryTitle });
  await showWholeBoard();
  expect(screen.getByRole("link", { name: /^Staff Engineer, Stripe/ })).toBeTruthy();
  mockCardRenders.mockClear();

  await fireEvent.press(screen.getByRole("button", { name: "Move Staff Engineer, Stripe" }));
  expect(await screen.findByText(DETAIL.stageTitle)).toBeTruthy();

  expect(mockCardRenders).not.toHaveBeenCalled();
});
