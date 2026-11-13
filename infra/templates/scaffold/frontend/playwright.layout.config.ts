import { defineMockedConfig } from "@platform/ui/test-support/mockedPlaywrightConfig";

// Off the dev server's __FRONTEND_DEV_PORT__, so it can run beside one.
export default defineMockedConfig({ port: "__FRONTEND_MOCKED_PORT__" });
