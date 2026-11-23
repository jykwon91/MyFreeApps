import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import { AppState } from "react-native";
import { refetchOnForeground } from "../utils/refetchOnForeground";

jest.mock("@react-native-community/netinfo", () => ({ __esModule: true, default: { addEventListener: jest.fn() } }));

type AppStateListener = (state: string) => void;
type NetworkListener = (state: NetInfoState) => void;

const reportOf = (isConnected: boolean | null) => ({ isConnected }) as NetInfoState;

function setUp() {
  const appStateListeners: AppStateListener[] = [];
  const networkListeners: NetworkListener[] = [];
  const removeAppState = jest.fn();
  const unsubscribeNetwork = jest.fn();
  jest.spyOn(AppState, "addEventListener").mockImplementation(((_: string, listener: AppStateListener) => {
    appStateListeners.push(listener);
    return { remove: removeAppState };
  }) as unknown as typeof AppState.addEventListener);
  jest.mocked(NetInfo.addEventListener).mockImplementation((listener: NetworkListener) => {
    networkListeners.push(listener);
    return unsubscribeNetwork;
  });
  const dispatch = jest.fn();
  const unsubscribe = refetchOnForeground(dispatch);
  return { dispatch, unsubscribe, appStateListeners, networkListeners, removeAppState, unsubscribeNetwork };
}

const dispatched = (dispatch: jest.Mock) => dispatch.mock.calls.map(([action]) => action.type);

it("tells the API layer when the app leaves and comes back", () => {
  const { dispatch, appStateListeners } = setUp();
  appStateListeners[0]("background");
  expect(dispatch).toHaveBeenLastCalledWith(expect.objectContaining({ type: "__rtkq/unfocused" }));
  appStateListeners[0]("active");
  expect(dispatch).toHaveBeenLastCalledWith(expect.objectContaining({ type: "__rtkq/focused" }));
});

it("tells the API layer when the network drops and comes back", () => {
  const { dispatch, networkListeners } = setUp();
  networkListeners[0](reportOf(true));
  networkListeners[0](reportOf(false));
  networkListeners[0](reportOf(true));
  expect(dispatched(dispatch)).toEqual(["__rtkq/offline", "__rtkq/online"]);
});

it("does not treat the network's first report as a change", () => {
  const { dispatch, networkListeners } = setUp();
  networkListeners[0](reportOf(false));
  expect(dispatch).not.toHaveBeenCalled();
});

it("ignores a report that doesn't know yet, and repeats of the same state", () => {
  const { dispatch, networkListeners } = setUp();
  networkListeners[0](reportOf(null));
  networkListeners[0](reportOf(true));
  networkListeners[0](reportOf(true));
  networkListeners[0](reportOf(null));
  expect(dispatch).not.toHaveBeenCalled();
});

it("stops listening to the app and the network when cleaned up", () => {
  const { unsubscribe, removeAppState, unsubscribeNetwork } = setUp();
  unsubscribe();
  expect(removeAppState).toHaveBeenCalledTimes(1);
  expect(unsubscribeNetwork).toHaveBeenCalledTimes(1);
});
