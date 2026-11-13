import { describe, expect, it } from "vitest";
import { MGA_LINK_PREVIEW } from "@/constants/linkPreview";
import { GUILD_PAGE_PATH, GUILD_SLUG } from "@/games/wow-forever/data/guild/guildConfig";

describe("link preview config", () => {
  it("shows the guild page's live backend-drawn card, not the generic WoW Forever one", () => {
    const route = MGA_LINK_PREVIEW.routes.find((r) => r.path === GUILD_PAGE_PATH);
    expect(route?.image).toBe(`/api/wow/guilds/${GUILD_SLUG}/preview.png`);
  });

  it("lists every route once and keeps the other WoW pages on the generic card", () => {
    const paths = MGA_LINK_PREVIEW.routes.map((r) => r.path);
    expect(new Set(paths).size).toBe(paths.length);
    const generic = MGA_LINK_PREVIEW.routes.filter((r) => r.path !== GUILD_PAGE_PATH);
    expect(generic.length).toBeGreaterThan(0);
    for (const route of generic) expect(route.image).toBe("/link-preview/wow-forever.png");
  });

  it("uses site-relative image paths, as the build plugin requires", () => {
    for (const page of [MGA_LINK_PREVIEW.root, ...MGA_LINK_PREVIEW.routes]) expect(page.image).toMatch(/^\/[^/\s]/);
  });
});
