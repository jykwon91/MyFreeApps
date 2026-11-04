import { uniqueById } from "../src/lib/uniqueById";

describe("uniqueById", () => {
  it("keeps the first of each id, in order", () => {
    expect(uniqueById([{ id: "a", n: 1 }, { id: "b", n: 2 }, { id: "a", n: 3 }])).toEqual([{ id: "a", n: 1 }, { id: "b", n: 2 }]);
  });
});
