import { afterEach, describe, it, expect } from "vitest";
import { isOwnClick } from "../utils/isOwnClick";

function build(html: string): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.append(container);
  return container;
}

describe("isOwnClick", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("is true for a click on plain content inside the container", () => {
    const container = build("<span>text</span>");
    expect(isOwnClick(container.querySelector("span"), container)).toBe(true);
  });

  it("is false for a click on or inside a control", () => {
    const container = build('<button type="button"><span>Open</span></button><input type="checkbox" /><a href="/x">x</a>');
    expect(isOwnClick(container.querySelector("button span"), container)).toBe(false);
    expect(isOwnClick(container.querySelector("input"), container)).toBe(false);
    expect(isOwnClick(container.querySelector("a"), container)).toBe(false);
  });

  it("is false for a click inside an inline menu or a Radix collection item", () => {
    const container = build('<div role="menu"><span id="pad">pad</span></div><div data-radix-collection-item><span id="item">x</span></div>');
    expect(isOwnClick(container.querySelector("#pad"), container)).toBe(false);
    expect(isOwnClick(container.querySelector("#item"), container)).toBe(false);
  });

  it("is false for a click outside the container, such as in a portalled menu", () => {
    const container = build("<span>text</span>");
    const menu = build('<div role="menu"><span>Item</span></div>');
    expect(isOwnClick(menu.querySelector("span"), container)).toBe(false);
  });

  it("is true when the container itself sits inside a control", () => {
    const outer = build("<button type='button'><div id='inner'><span>text</span></div></button>");
    const inner = outer.querySelector("#inner");
    if (inner === null) throw new Error("inner container missing");
    expect(isOwnClick(inner.querySelector("span"), inner)).toBe(true);
  });
});
