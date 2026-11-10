import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SignedLeaseTemplateLink } from "@mybookkeeper/api-client/types/lease/signed-lease-template-link";
import LeaseTemplateSources from "@/app/features/leases/LeaseTemplateSources";

function link(overrides: Partial<SignedLeaseTemplateLink>): SignedLeaseTemplateLink {
  return {
    id: "tpl-1",
    name: "Master Lease (2027)",
    version: 4,
    display_order: 0,
    template_name_snapshot: "Master Lease",
    template_version_snapshot: 3,
    ...overrides,
  };
}

describe("LeaseTemplateSources", () => {
  it("shows the rendered name and version of each template, not the current ones", () => {
    render(
      <LeaseTemplateSources
        templates={[
          link({}),
          link({ id: "tpl-2", name: "Pet addendum", template_name_snapshot: "Pet addendum", template_version_snapshot: null }),
        ]}
      />,
    );
    const rows = screen.getAllByTestId("lease-template-source");
    expect(rows.map((r) => r.textContent)).toEqual([
      "Generated from Master Lease v3",
      "Generated from Pet addendum",
    ]);
  });

  it("skips templates that have not been rendered", () => {
    render(
      <LeaseTemplateSources
        templates={[link({}), link({ id: "tpl-2", template_name_snapshot: null, template_version_snapshot: null })]}
      />,
    );
    expect(screen.getAllByTestId("lease-template-source")).toHaveLength(1);
  });

  it("renders nothing when no template has been rendered", () => {
    render(<LeaseTemplateSources templates={[link({ template_name_snapshot: null, template_version_snapshot: null })]} />);
    expect(screen.queryByTestId("lease-template-sources")).toBeNull();
  });
});
