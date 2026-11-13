/**
 * WCAG contrast of what the browser actually paints, for mocked specs. Colours are painted
 * onto a 1x1 canvas, so any computed form (rgb, oklab, color-mix, alpha) is read back as
 * sRGB; a colour the canvas can't parse throws instead of silently reusing the previous one.
 * An element's backdrop is its own and its ancestors' backgrounds composited from the root
 * down; ancestor `opacity`, filters and backdrop blur are not modelled.
 */
import type { Locator } from "@playwright/test";
import type { PaintedContrast } from "../types/PaintedContrast";

/** `el`'s text against its backdrop, its backdrop against its parent's, and its ring against its parent's. */
export function paintedContrast(el: Locator): Promise<PaintedContrast> {
  return el.evaluate((target) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    // Assigning an unparseable colour leaves fillStyle as it was, so set it from two
    // different sentinels: a colour that was parsed gives the same result both times.
    const paint = (color: string): void => {
      ctx.fillStyle = "#010203";
      ctx.fillStyle = color;
      const first = ctx.fillStyle;
      ctx.fillStyle = "#040506";
      ctx.fillStyle = color;
      if (ctx.fillStyle !== first) throw new Error(`paintedContrast: the canvas can't parse the colour "${color}"`);
      ctx.fillRect(0, 0, 1, 1);
    };
    const read = (): [number, number, number] => {
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      return [r!, g!, b!];
    };
    const luminance = ([r, g, b]: [number, number, number]): number => {
      const lin = (c: number): number => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    const ratio = (a: [number, number, number], b: [number, number, number]): number => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi! + 0.05) / (lo! + 0.05);
    };
    /** The colour of the widest solid box-shadow ring (`<color> 0px 0px 0px <spread>`), if any. */
    const ringColor = (boxShadow: string): string | null => {
      let widest: { color: string; spread: number } | null = null;
      for (const layer of boxShadow.split(/,(?![^(]*\))/)) {
        const match = /^\s*(.+?)\s+0px 0px 0px ([\d.]+)px\s*$/.exec(layer);
        const spread = match ? Number(match[2]) : 0;
        if (match && spread > 0 && (!widest || spread > widest.spread)) widest = { color: match[1]!, spread };
      }
      return widest?.color ?? null;
    };

    const chain: Element[] = [];
    for (let node: Element | null = target; node; node = node.parentElement) chain.unshift(node);
    const style = getComputedStyle(target);
    paint("#fff");
    for (const node of chain.slice(0, -1)) paint(getComputedStyle(node).backgroundColor);
    const parentBackdrop = read();

    const ringPaint = ringColor(style.boxShadow);
    let ring: number | null = null;
    if (ringPaint) {
      paint(ringPaint);
      ring = ratio(read(), parentBackdrop);
      paint(`rgb(${parentBackdrop.join(",")})`);
    }

    paint(style.backgroundColor);
    const backdrop = read();
    paint(style.color);
    const ink = read();

    return { text: ratio(ink, backdrop), box: ratio(backdrop, parentBackdrop), ring };
  });
}
