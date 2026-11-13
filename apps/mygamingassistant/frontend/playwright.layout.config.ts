import { defineMockedConfig } from "@platform/ui/test-support/mockedPlaywrightConfig";

// Off the dev server's 5176 and the serve-only suites' 5177 / 5185, so it can run beside them.
export default defineMockedConfig({ port: "5184" });
