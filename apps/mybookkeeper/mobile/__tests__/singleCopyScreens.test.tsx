import { describeSingleCopyScreens } from "@platform/mobile/test-support/describeSingleCopyScreens";
import { SINGLE_COPY_SCREENS } from "../src/constants/singleCopyScreens";

jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);

describeSingleCopyScreens({
  screens: SINGLE_COPY_SCREENS,
  loadScreen: (name) => jest.requireActual(`../app/(app)/${name}`),
  distinctPair: ["/leases/l1", "/leases/l2"],
});
