import { useGetPropertiesQuery } from "@mybookkeeper/api-client/store/propertiesApi";
import { fireEvent, render, screen } from "@testing-library/react-native";
import PropertyChoiceField from "../src/features/properties/PropertyChoiceField";
import type { PropertyChoiceMessages } from "../src/types/PropertyChoiceMessages";

jest.mock("@mybookkeeper/api-client/store/propertiesApi", () => ({ useGetPropertiesQuery: jest.fn() }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("react-native/Libraries/Modal/Modal", () => ({
  __esModule: true,
  default: ({ visible, children }: { visible: boolean; children: unknown }) => (visible ? children : null),
}));
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

const MESSAGES = {
  property: "Property",
  propertyNone: "Choose a property",
  propertySheetTitle: "Choose a property",
  propertiesLoading: "Loading your properties",
  propertiesFailed: "I couldn't load your properties.",
  noProperties: "You have no properties yet.",
  addProperty: "Add a property",
} as unknown as PropertyChoiceMessages;

const PROPERTIES = [
  { id: "p1", name: "Maple House" },
  { id: "p2", name: "Oak Cottage" },
];

function mockQuery(state: Record<string, unknown>): void {
  jest.mocked(useGetPropertiesQuery).mockReturnValue({ isLoading: false, isFetching: false, refetch: jest.fn(), ...state } as never);
}

async function showField(): Promise<void> {
  await render(<PropertyChoiceField disabled={false} messages={MESSAGES} onChange={jest.fn()} value="p2" />);
}

describe("PropertyChoiceField when a refresh fails", () => {
  it("keeps the chosen property and the list when the properties were already loaded", async () => {
    mockQuery({ data: PROPERTIES, error: { status: "FETCH_ERROR" } });
    await showField();

    expect(screen.queryByText(MESSAGES.propertiesFailed)).toBeNull();
    await fireEvent.press(screen.getByLabelText("Property *, Oak Cottage"));
    expect(await screen.findByText("Maple House")).toBeTruthy();
  });

  it("shows the error and a retry when nothing was ever loaded", async () => {
    mockQuery({ data: undefined, error: { status: "FETCH_ERROR" } });
    await showField();

    expect(screen.getByText(MESSAGES.propertiesFailed)).toBeTruthy();
    expect(screen.getByText("Try again")).toBeTruthy();
  });
});
