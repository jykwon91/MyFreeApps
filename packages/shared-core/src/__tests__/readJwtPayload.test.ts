import { describe, expect, it } from "vitest";

import { tokenIdentity } from "../utils/tokenIdentity";
import { readJwtPayload } from "../utils/readJwtPayload";

// JWTs encode their segments as unpadded base64url, which uses - and _ where
// base64 uses + and /.
function jwtWith(claims: Record<string, unknown>): string {
  return `header.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.signature`;
}

describe("readJwtPayload", () => {
  it.each([
    ["_", "user-a?>"],
    ["-", "user-a~"],
  ])("reads a payload whose base64url contains %s", (char, sub) => {
    const token = jwtWith({ sub, exp: 4_102_444_800 });
    expect(token.split(".")[1]).toContain(char);

    expect(readJwtPayload(token)).toEqual({ sub, exp: 4_102_444_800 });
  });

  it("reads a payload whose length needs padding", () => {
    const token = jwtWith({ sub: "subject?", exp: 4_102_444_800 });
    expect(token.split(".")[1].length % 4).not.toBe(0);
    expect(readJwtPayload(token)).toEqual({ sub: "subject?", exp: 4_102_444_800 });
  });

  it.each([["no-dots"], ["header.%%%.signature"], [`header.${Buffer.from("[1]").toString("base64url")}.sig`]])(
    "is null for %s, which has no claims object",
    (token) => {
      expect(readJwtPayload(token)).toBeNull();
    },
  );
});

describe("tokenIdentity", () => {
  it("is the sub, even when its base64url has - or _", () => {
    expect(tokenIdentity(jwtWith({ sub: "user-a?>" }))).toBe("user-a?>");
  });

  it("is the token itself when it names no one", () => {
    expect(tokenIdentity("opaque")).toBe("opaque");
  });

  it("is null when signed out", () => {
    expect(tokenIdentity(null)).toBeNull();
  });
});
