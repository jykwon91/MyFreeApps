import { ALL_DESTINATIONS } from "../src/constants/allDestinations";
import type { DestinationViewer } from "../src/types/DestinationViewer";
import type { MoreMenuGroup } from "@platform/mobile";
import type { MoreDestination } from "../src/types/MoreDestination";
import { canSee, filterDestinations, flattenDestinations, visibleGroups } from "../src/utils/destinationSearch";

const ADMIN: DestinationViewer = { isAdmin: true, canWrite: true };
const MEMBER: DestinationViewer = { isAdmin: false, canWrite: true };
const READ_ONLY: DestinationViewer = { isAdmin: false, canWrite: false };

const GROUPS: readonly MoreMenuGroup<MoreDestination>[] = [
  {
    title: "Leasing",
    items: [
      { label: "Rent Receipts", screen: "/receipts" },
      { label: "Leases", screen: "/leases", keywords: ["rent", "tenancy"] },
      { label: "New lease", screen: "/leases/new", access: "write" },
    ],
  },
  {
    title: "Tax",
    items: [
      { label: "Tax Documents", screen: "/tax/documents", keywords: ["1099", "schedule e", "w-2"] },
      { label: "Property P&L", screen: "/pnl", keywords: ["profit"] },
      { label: "Résumé Tenant’s Notes", screen: "/notes" },
    ],
  },
  { title: "Account", items: [{ label: "Members", screen: "/members", access: "admin", keywords: ["invite"] }] },
];

const labels = (query: string, viewer: DestinationViewer = ADMIN) =>
  filterDestinations(flattenDestinations(GROUPS, viewer), query).map(({ item }) => item.label);

describe("canSee", () => {
  it("lets everyone see an item with no access", () => {
    expect(canSee({ label: "A", screen: "/a" }, READ_ONLY)).toBe(true);
  });

  it("keeps admin items for admins and write items for people who can write", () => {
    const admin = { label: "A", screen: "/a", access: "admin" } as const;
    const write = { label: "W", screen: "/w", access: "write" } as const;
    expect([canSee(admin, ADMIN), canSee(admin, MEMBER), canSee(admin, READ_ONLY)]).toEqual([true, false, false]);
    expect([canSee(write, ADMIN), canSee(write, MEMBER), canSee(write, READ_ONLY)]).toEqual([true, true, false]);
  });
});

describe("flattenDestinations and visibleGroups", () => {
  it("lists every item with its group for an admin", () => {
    expect(flattenDestinations(GROUPS, ADMIN).map(({ item, groupTitle }) => `${groupTitle}/${item.label}`)).toEqual([
      "Leasing/Rent Receipts",
      "Leasing/Leases",
      "Leasing/New lease",
      "Tax/Tax Documents",
      "Tax/Property P&L",
      "Tax/Résumé Tenant’s Notes",
      "Account/Members",
    ]);
  });

  it("drops admin items for members and write items for read-only members", () => {
    const names = (viewer: DestinationViewer) => flattenDestinations(GROUPS, viewer).map(({ item }) => item.label);
    expect(names(MEMBER)).not.toContain("Members");
    expect(names(MEMBER)).toContain("New lease");
    expect(names(READ_ONLY)).not.toContain("New lease");
    expect(names(READ_ONLY)).not.toContain("Members");
  });

  it("leaves out a group with nothing left in it", () => {
    expect(visibleGroups(GROUPS, MEMBER).map((group) => group.title)).not.toContain("Account");
  });
});

describe("filterDestinations", () => {
  it("matches nothing for a blank query or one with no letters or digits", () => {
    expect(labels("")).toEqual([]);
    expect(labels("   ")).toEqual([]);
    expect(labels("& -")).toEqual([]);
  });

  it("ignores case and surrounding spaces", () => {
    expect(labels("  TAX doc ")).toEqual(["Tax Documents"]);
  });

  it("matches a keyword with a space or digits", () => {
    expect(labels("schedule e")).toEqual(["Tax Documents"]);
    expect(labels("1099")).toEqual(["Tax Documents"]);
  });

  it("matches word starts in any order", () => {
    expect(labels("documents tax")).toEqual(["Tax Documents"]);
    expect(labels("doc ta")).toEqual(["Tax Documents"]);
    expect(labels("rec rent")).toEqual(["Rent Receipts"]);
  });

  it("matches punctuation and spacing either way", () => {
    expect(labels("w2")).toEqual(["Tax Documents"]);
    expect(labels("w-2")).toEqual(["Tax Documents"]);
    expect(labels("p & l")).toEqual(["Property P&L"]);
    expect(labels("p&l")).toEqual(["Property P&L"]);
    expect(labels("pl")).toEqual(["Property P&L"]);
  });

  it("ignores accents and curly quotes", () => {
    expect(labels("resume")).toEqual(["Résumé Tenant’s Notes"]);
    expect(labels("tenants")).toEqual(["Résumé Tenant’s Notes"]);
    expect(labels("tenant's")).toEqual(["Résumé Tenant’s Notes"]);
  });

  it("ranks a label word start, then the label containing it, then a keyword", () => {
    const groups: readonly MoreMenuGroup<MoreDestination>[] = [
      { title: "G", items: [
        { label: "Alpha", screen: "/a", keywords: ["lease"] },
        { label: "Sublease", screen: "/b" },
        { label: "Lease Terms", screen: "/c" },
      ] },
    ];
    const found = filterDestinations(flattenDestinations(groups, ADMIN), "lease").map(({ item }) => item.label);
    expect(found).toEqual(["Lease Terms", "Sublease", "Alpha"]);
  });

  it("keeps menu order within a rank", () => {
    expect(labels("rent")).toEqual(["Rent Receipts", "Leases"]);
  });

  it("finds nothing when no label or keyword matches", () => {
    expect(labels("zebra")).toEqual([]);
  });

  it("never finds a screen the viewer can't use", () => {
    expect(labels("invite", MEMBER)).toEqual([]);
    expect(labels("invite", ADMIN)).toEqual(["Members"]);
    expect(labels("new lease", READ_ONLY)).toEqual([]);
    expect(labels("new lease", MEMBER)).toContain("New lease");
  });
});

describe("the real destinations", () => {
  const find = (query: string, viewer: DestinationViewer = ADMIN) =>
    filterDestinations(flattenDestinations(ALL_DESTINATIONS, viewer), query).map(({ item }) => item.label);

  it("finds the tab screens and ones opened from inside another screen", () => {
    expect(find("transactions")).toContain("Transactions");
    expect(find("duplicates")).toContain("Duplicates");
    expect(find("inquiries")).toContain("Inquiries");
  });

  it("finds Leases and Rent Receipts for rent, and Tax for 1099 and schedule e", () => {
    expect(find("rent")).toEqual(expect.arrayContaining(["Rent Receipts", "Leases"]));
    expect(find("1099")).toContain("Tax Documents");
    expect(find("schedule e")).toContain("Tax Report");
  });

  it("finds sign out, log out and devices", () => {
    for (const query of ["sign out", "log out", "devices"]) expect(find(query, READ_ONLY)).toContain("Sign out and devices");
  });

  it("hides the screens that only make sense when you can write from a read-only member", () => {
    const readOnly = flattenDestinations(ALL_DESTINATIONS, READ_ONLY).map(({ item }) => item.label);
    for (const label of ["Add a transaction", "Import bank transactions", "New lease", "Import a lease", "Members"]) {
      expect(readOnly).not.toContain(label);
    }
    expect(readOnly).toEqual(expect.arrayContaining(["Duplicates", "Review bookings", "Delete my account"]));
  });
});
