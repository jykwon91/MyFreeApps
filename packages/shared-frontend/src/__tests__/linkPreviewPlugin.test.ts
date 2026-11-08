import { describe, expect, it } from "vitest";
import { linkPreviewPlugin } from "../vite/linkPreview/linkPreviewPlugin";
import { renderLinkPreviewHtml } from "../vite/linkPreview/renderLinkPreviewHtml";
import { routeHtmlFileName } from "../vite/linkPreview/routeHtmlFileName";
import type { LinkPreviewConfig } from "../vite/linkPreview/types/LinkPreviewConfig";

const BUILT_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="description" content="Old description" />
    <meta property="og:title" content="Old" />
    <title>App</title>
    <script>(function(){document.documentElement.dataset.theme="dark"})()</script>
    <script type="module" crossorigin src="/assets/index-abc.js"></script>
  </head>
  <body><div id="root"></div></body>
</html>
`;

const CONFIG: LinkPreviewConfig = {
  site: { name: "Example", origin: "https://example.myfreeapps.org" },
  root: { title: "Example", description: "The whole site.", image: "/link-preview/site.png" },
  routes: [
    { path: "/guide", title: "Guide · Example", description: "How it works.", image: "/link-preview/guide.png" },
    { path: "/guide/map", title: "Map · Example", description: "The map.", image: "/link-preview/guide.png" },
  ],
};

interface BundleAsset {
  type: "asset";
  fileName: string;
  source: string;
}

type GenerateBundle = (this: unknown, options: unknown, bundle: Record<string, BundleAsset>) => void;

function runBuild(config: LinkPreviewConfig, html: string = BUILT_HTML) {
  const plugin = linkPreviewPlugin(config);
  const emitted: BundleAsset[] = [];
  const bundle: Record<string, BundleAsset> = {
    "index.html": { type: "asset", fileName: "index.html", source: html },
  };
  const context = {
    emitFile: (file: BundleAsset) => {
      emitted.push(file);
      return file.fileName;
    },
    error: (message: string) => {
      throw new Error(message);
    },
  };
  (plugin.generateBundle as GenerateBundle).call(context, {}, bundle);
  return { plugin, emitted, root: bundle["index.html"].source };
}

describe("linkPreviewPlugin", () => {
  it("only runs in builds, after other plugins", () => {
    const { plugin } = runBuild(CONFIG);
    expect(plugin.apply).toBe("build");
    expect(plugin.enforce).toBe("post");
  });

  it("writes the root tags into index.html", () => {
    const { root } = runBuild(CONFIG);
    expect(root).toContain("<title>Example</title>");
    expect(root).toContain('<meta property="og:url" content="https://example.myfreeapps.org/" />');
    expect(root).toContain('<meta property="og:image" content="https://example.myfreeapps.org/link-preview/site.png" />');
    expect(root).not.toContain("Old description");
  });

  it("writes one file per listed route and nothing else", () => {
    const { emitted } = runBuild(CONFIG);
    expect(emitted.map((file) => file.fileName)).toEqual(["guide/index.html", "guide/map/index.html"]);
    const map = emitted[1].source;
    expect(map).toContain("<title>Map · Example</title>");
    expect(map).toContain('<meta property="og:url" content="https://example.myfreeapps.org/guide/map" />');
    expect(map).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(map).toContain('<meta property="og:image:width" content="1200" />');
    expect(map).toContain('<meta property="og:image:height" content="630" />');
  });

  it("skips routes that aren't listed", () => {
    const { emitted } = runBuild(CONFIG);
    expect(emitted.some((file) => file.fileName.startsWith("guide/items"))).toBe(false);
    expect(emitted).toHaveLength(CONFIG.routes.length);
  });

  it("leaves scripts byte-for-byte as they were", () => {
    const { root, emitted } = runBuild(CONFIG);
    const inline = '<script>(function(){document.documentElement.dataset.theme="dark"})()</script>';
    expect(root).toContain(inline);
    expect(emitted[0].source).toContain(inline);
    expect(emitted[0].source).toContain('src="/assets/index-abc.js"');
  });

  it("fails the build when index.html is missing", () => {
    const plugin = linkPreviewPlugin(CONFIG);
    const context = {
      emitFile: () => "",
      error: (message: string) => {
        throw new Error(message);
      },
    };
    expect(() => (plugin.generateBundle as GenerateBundle).call(context, {}, {})).toThrow(/no index.html/);
  });

  it("rejects a duplicate route", () => {
    expect(() => linkPreviewPlugin({ ...CONFIG, routes: [CONFIG.routes[0], CONFIG.routes[0]] })).toThrow(/twice/);
  });

  it("rejects an origin that isn't https or ends in a slash", () => {
    expect(() => linkPreviewPlugin({ ...CONFIG, site: { ...CONFIG.site, origin: "http://example.org" } })).toThrow();
    expect(() => linkPreviewPlugin({ ...CONFIG, site: { ...CONFIG.site, origin: "https://example.org/" } })).toThrow();
  });

  it("rejects an image that isn't site-relative", () => {
    expect(() =>
      linkPreviewPlugin({ ...CONFIG, root: { ...CONFIG.root, image: "https://elsewhere.org/a.png" } }),
    ).toThrow(/site-relative/);
  });
});

describe("renderLinkPreviewHtml", () => {
  it("escapes every value", () => {
    const html = renderLinkPreviewHtml(
      BUILT_HTML,
      { title: `<b>"Tom" & 'Jerry'</b>`, description: `a<script>alert(1)</script>`, image: "/x.png" },
      CONFIG.site,
      "/guide",
    );
    expect(html).toContain("<title>&lt;b&gt;&quot;Tom&quot; &amp; &#39;Jerry&#39;&lt;/b&gt;</title>");
    expect(html).toContain('content="a&lt;script&gt;alert(1)&lt;/script&gt;"');
    expect(html).not.toContain("<script>alert(1)");
  });

  it("is idempotent", () => {
    const once = renderLinkPreviewHtml(BUILT_HTML, CONFIG.routes[0], CONFIG.site, "/guide");
    expect(renderLinkPreviewHtml(once, CONFIG.routes[0], CONFIG.site, "/guide")).toBe(once);
  });

  it("uses a canonical URL when one is given", () => {
    const html = renderLinkPreviewHtml(
      BUILT_HTML,
      { ...CONFIG.routes[0], canonical: "https://example.myfreeapps.org/other" },
      CONFIG.site,
      "/guide",
    );
    expect(html).toContain('<link rel="canonical" href="https://example.myfreeapps.org/other" />');
    expect(html).toContain('<meta property="og:url" content="https://example.myfreeapps.org/other" />');
  });

  it("throws when the HTML has no <title>", () => {
    expect(() => renderLinkPreviewHtml("<html><head></head></html>", CONFIG.root, CONFIG.site, "/")).toThrow(/title/);
  });
});

describe("routeHtmlFileName", () => {
  it("maps a route to its directory index", () => {
    expect(routeHtmlFileName("/wow-forever")).toBe("wow-forever/index.html");
    expect(routeHtmlFileName("/wow-forever/map")).toBe("wow-forever/map/index.html");
  });

  it.each(["/", "", "wow", "/wow/", "/Wow", "/a/../b", "/a b", "/a?x=1", "/a/:id"])("rejects %j", (path) => {
    expect(() => routeHtmlFileName(path)).toThrow();
  });
});
