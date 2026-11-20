// @vitest-environment jsdom
/**
 * useCompanyResolver adds a company only when the application is saved: reading a posting just matches,
 * so a form closed without saving leaves no company behind. Saving links a company that already has the
 * name or domain, including the one a refused add (409, the domain is taken) points to.
 */
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCompanyResolver } from "../hooks/useCompanyResolver";
import type { Company } from "../types/company";

const loadCompanies = vi.fn();
const createCompany = vi.fn();
const triggerResearch = vi.fn();

vi.mock("../store/companiesApi", () => ({
  useLazyListCompaniesQuery: () => [loadCompanies],
  useCreateCompanyMutation: () => [createCompany],
  useTriggerCompanyResearchMutation: () => [triggerResearch],
}));

const hostnameOf = (url: string) => new URL(url).hostname;
const always = () => true;
const DOMAIN_TAKEN = { status: 409, data: { detail: "A company with primary_domain='linear.app' already exists." } };

function company(id: string, name: string, primary_domain: string | null = null): Company {
  return {
    id,
    user_id: "u1",
    name,
    primary_domain,
    logo_url: null,
    industry: null,
    size_range: null,
    hq_location: null,
    description: null,
    external_ref: null,
    external_source: null,
    crunchbase_id: null,
    created_at: "",
    updated_at: "",
  };
}

/** Each GET /companies answers with the next list given, the last one again after that. */
function serveLists(...lists: Company[][]) {
  let call = 0;
  loadCompanies.mockImplementation(() => {
    const items = lists[Math.min(call++, lists.length - 1)];
    return { unwrap: () => Promise.resolve({ items, total: items.length }) };
  });
}

function serveCreate(reply: () => Promise<Company>) {
  createCompany.mockImplementation(() => ({ unwrap: reply }));
}

function resolver() {
  return renderHook(() => useCompanyResolver(hostnameOf)).result.current;
}

beforeEach(() => {
  vi.clearAllMocks();
  triggerResearch.mockImplementation(() => ({ unwrap: () => Promise.resolve({}) }));
});

describe("reading a posting", () => {
  it("adds nothing for a company that isn't tracked: it's held as new, with the posting's domain and logo", async () => {
    serveLists([company("co-acme", "Acme")]);
    serveCreate(() => Promise.resolve(company("co-linear", "Linear")));

    const outcome = await resolver().resolveReadCompany(
      "Linear",
      { website: "https://www.linear.app/", logoUrl: "https://cdn.example/linear.png" },
      always,
    );

    expect(outcome).toEqual({
      kind: "resolved",
      company: {
        kind: "new",
        request: { name: "Linear", primary_domain: "linear.app", logo_url: "https://cdn.example/linear.png" },
        name: "Linear",
        logoUrl: "https://cdn.example/linear.png",
      },
    });
    expect(createCompany).not.toHaveBeenCalled();
    expect(triggerResearch).not.toHaveBeenCalled();
  });

  it("matches a tracked company by name", async () => {
    serveLists([company("co-linear", "Linear")]);

    const outcome = await resolver().resolveReadCompany(" linear ", {}, always);

    expect(outcome).toEqual({ kind: "resolved", company: { kind: "tracked", companyId: "co-linear", name: "Linear", logoUrl: null } });
    expect(createCompany).not.toHaveBeenCalled();
  });
});

describe("saving", () => {
  const NEW_LINEAR = {
    kind: "new",
    request: { name: "Linear", primary_domain: "linear.app" },
    name: "Linear",
    logoUrl: null,
  } as const;

  it("adds a new company, researches it, and saves under it", async () => {
    serveLists([]);
    serveCreate(() => Promise.resolve(company("co-linear", "Linear", "linear.app")));

    await expect(resolver().companyIdForSave(NEW_LINEAR)).resolves.toBe("co-linear");

    expect(createCompany).toHaveBeenCalledWith({ name: "Linear", primary_domain: "linear.app" });
    expect(triggerResearch).toHaveBeenCalledWith("co-linear");
  });

  it("links the company that already has the domain when the add is refused for it", async () => {
    // Not in the list when Save looked; the refused add's fresh list has it, under another name.
    serveLists([], [company("co-linear-inc", "Linear Inc", "linear.app")]);
    serveCreate(() => Promise.reject(DOMAIN_TAKEN));

    await expect(resolver().companyIdForSave(NEW_LINEAR)).resolves.toBe("co-linear-inc");

    expect(createCompany).toHaveBeenCalledTimes(1);
    expect(triggerResearch).not.toHaveBeenCalled();
    // Both lists were fetched afresh, not served from the cache.
    expect(loadCompanies.mock.calls.map(([, preferCacheValue]) => preferCacheValue)).toEqual([false, false]);
  });

  it("links a company with the domain already in the list, without trying to add it", async () => {
    serveLists([company("co-linear-inc", "Linear Inc", "LINEAR.app")]);

    await expect(resolver().companyIdForSave(NEW_LINEAR)).resolves.toBe("co-linear-inc");

    expect(createCompany).not.toHaveBeenCalled();
  });

  it("still fails a refused add when no company has the domain after all", async () => {
    serveLists([]);
    serveCreate(() => Promise.reject(DOMAIN_TAKEN));

    await expect(resolver().companyIdForSave(NEW_LINEAR)).rejects.toBe(DOMAIN_TAKEN);
  });

  it("fails any other refused add", async () => {
    const boom = { status: 500, data: { detail: "boom" } };
    serveLists([]);
    serveCreate(() => Promise.reject(boom));

    await expect(resolver().companyIdForSave(NEW_LINEAR)).rejects.toBe(boom);
    expect(loadCompanies).toHaveBeenCalledTimes(1);
  });

  it("uses a tracked company's id as it is, asking nothing", async () => {
    await expect(
      resolver().companyIdForSave({ kind: "tracked", companyId: "co-1", name: "Acme", logoUrl: null }),
    ).resolves.toBe("co-1");
    expect(loadCompanies).not.toHaveBeenCalled();
    expect(createCompany).not.toHaveBeenCalled();
  });

  it("has no company to save under when nothing was named", async () => {
    await expect(resolver().companyIdForSave({ kind: "autoCreateFailed", name: "" })).resolves.toBeNull();
    expect(createCompany).not.toHaveBeenCalled();
  });
});
