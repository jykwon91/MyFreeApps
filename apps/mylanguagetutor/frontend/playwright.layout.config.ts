import { defineMockedConfig } from "@platform/ui/test-support/mockedPlaywrightConfig";

// Off the dev server's 5182, so it can run beside one.
export default defineMockedConfig({ port: "5183" });
