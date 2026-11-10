import { websiteToDomain } from "@myjobhunter/api-client/utils/websiteToDomain";
import { urlHostname } from "../src/lib/urlHostname";

/** The phone reads a company's domain as the website's `new URL(...).hostname` does. */
describe("a company website's domain", () => {
  it("reads the host from a full link, without www", () => {
    expect(websiteToDomain("https://www.Stripe.com/jobs?x=1", urlHostname)).toBe("stripe.com");
  });

  it("drops a port and sign-in details", () => {
    expect(websiteToDomain("https://user:pass@jobs.example.com:8443/a", urlHostname)).toBe("jobs.example.com");
  });

  it("encodes an international name as a browser does", () => {
    expect(websiteToDomain("https://www.Bücher.de/jobs", urlHostname)).toBe("xn--bcher-kva.de");
    expect(urlHostname("https://BÜCHER.de")).toBe("xn--bcher-kva.de");
  });

  it("falls back to the text itself when it isn't a link", () => {
    expect(websiteToDomain("www.stripe.com/", urlHostname)).toBe("stripe.com");
  });
});
