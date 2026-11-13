import { describe, expect, it } from "vitest";
import { guildTabFromParams, guildTabImplied, withGuildTab } from "@/games/wow-forever/lib/guild/guildTabParams";

const at = (search: string) => new URLSearchParams(search);

describe("guild tab in the URL", () => {
  it("opens the named tab, and the first tab for none or an unknown one", () => {
    expect(guildTabFromParams(at("?tab=roster"))).toBe("roster");
    expect(guildTabFromParams(at(""))).toBe("home");
    expect(guildTabFromParams(at("?tab=nope"))).toBe("home");
    expect(guildTabFromParams(at("?me=tiny"))).toBe("home");
  });

  it("sends a link made before the tabs to the tab holding what it pointed at", () => {
    expect(guildTabFromParams(at("?board=exalted"))).toBe("home");
    expect(guildTabFromParams(at("?faction=stormwind"))).toBe("home");
    expect(guildTabFromParams(at("?recipe=linen&board=exalted"))).toBe("crafting");
    expect(guildTabFromParams(at("?class=Mage"))).toBe("roster");
    expect(guildTabFromParams(at("?tab=titles&board=exalted"))).toBe("titles");
  });

  it("opens Home for the retired This week and Arena tabs", () => {
    expect(guildTabFromParams(at("?tab=week"))).toBe("home");
    expect(guildTabFromParams(at("?tab=arena"))).toBe("home");
    expect(guildTabFromParams(at("?tab=arena&class=Mage"))).toBe("home");
    expect(guildTabFromParams(at("?tab=toString"))).toBe("home");
  });

  it("writes every tab but the first, keeps the other params and their order, and names the first only when needed", () => {
    expect(withGuildTab(at("?me=tiny"), "titles").toString()).toBe("me=tiny&tab=titles");
    expect(withGuildTab(at("?tab=titles&board=pvp"), "roster").toString()).toBe("tab=roster&board=pvp");
    expect(withGuildTab(at("?tab=titles&me=tiny"), "home").toString()).toBe("me=tiny");
    expect(withGuildTab(at("?board=pvp"), "home").toString()).toBe("board=pvp");
    expect(withGuildTab(at("?class=Mage"), "home").toString()).toBe("class=Mage&tab=home");
    expect(withGuildTab(at("?tab=week&me=tiny"), "home").toString()).toBe("me=tiny");
  });

  it("spots a link that opens a tab without naming it", () => {
    expect(guildTabImplied(at("?recipe=linen"))).toBe(true);
    expect(guildTabImplied(at("?recipe=linen&tab=crafting"))).toBe(false);
    expect(guildTabImplied(at("?me=tiny"))).toBe(false);
    expect(guildTabImplied(at("?tab=week"))).toBe(true);
    expect(guildTabImplied(at("?tab=arena&me=tiny"))).toBe(true);
    expect(guildTabImplied(at("?board=exalted"))).toBe(false);
  });
});
