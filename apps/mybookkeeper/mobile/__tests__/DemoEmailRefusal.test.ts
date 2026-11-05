import { emailLeaseFailure } from "../src/features/leases/emailLeaseFailure";
import { extendLeaseFailure } from "../src/features/leases/extendLeaseFailure";

const demoRefusal = { status: 403, data: { detail: "This feature is not available for demo accounts" } };
const viewOnly = { status: 403, data: { detail: "Write access required" } };

describe("a demo account asking to email a tenant", () => {
  it("says why the lease email didn't go, rather than calling it view-only", () => {
    expect(emailLeaseFailure(demoRefusal, "Dana")).toBe("Demo accounts can't send email.");
    expect(emailLeaseFailure(viewOnly, "Dana")).toBe("You have view-only access.");
  });

  it("says the extension didn't happen either", () => {
    expect(extendLeaseFailure(demoRefusal)).toBe("Demo accounts can't send email. Nothing was changed.");
    expect(extendLeaseFailure(viewOnly)).toBe("You have view-only access.");
  });
});
