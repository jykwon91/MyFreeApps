import { assertSecureApiUrl } from "../utils/assertSecureApiUrl";

describe("assertSecureApiUrl", () => {
  it("refuses http in a release build", () => {
    expect(() => assertSecureApiUrl("http://example.com/api", false)).toThrow("https");
  });

  it("allows https in a release build", () => {
    expect(() => assertSecureApiUrl("https://example.com/api", false)).not.toThrow();
  });

  it("allows http during development", () => {
    expect(() => assertSecureApiUrl("http://192.168.1.2:8000/api", true)).not.toThrow();
  });
});
