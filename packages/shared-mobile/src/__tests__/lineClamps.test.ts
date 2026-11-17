import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { clampFile, rawLineClamps } from "../../test-support/rawLineClamps";

const ROOT = join(__dirname, "..", "..");

// Each kept on purpose: the text sits somewhere that can't grow, and its whole is read out another way.
const REVIEWED: Record<string, string> = {
  // An axis label under a bar, in a strip whose height chartTextFit sizes for the text; each bar reads out its label whole.
  "src/components/GroupedBarChart.tsx": "chart axis label in a fixed strip",
};

describe("line limits in the shared package", () => {
  it("lift at a large text size everywhere but the reviewed places", () => {
    expect(rawLineClamps(ROOT, ["src"]).filter((site) => !(clampFile(site) in REVIEWED))).toEqual([]);
  });

  it("has no reviewed place left that no longer keeps a limit", () => {
    const files = new Set(rawLineClamps(ROOT, ["src"]).map(clampFile));
    expect(Object.keys(REVIEWED).filter((file) => !files.has(file))).toEqual([]);
  });

  it("the check catches a limit that would cut text short at a large text size", () => {
    const root = mkdtempSync(join(tmpdir(), "line-clamp-check-"));
    const write = (name: string, code: string) => writeFileSync(join(root, "src", name), code);
    try {
      mkdirSync(join(root, "src", "rows", "__tests__"), { recursive: true });
      write("rows/NameRow.tsx", "export default () => (\n  <View>\n    <Text numberOfLines={1}>{name}</Text>\n  </View>\n);");
      write("rows/Animated.tsx", "export default () => <Animated.Text numberOfLines={2}>{name}</Animated.Text>;");
      write("rows/Hand.tsx", "export default () => <Text numberOfLines={isLargeText ? undefined : 1}>{name}</Text>;");
      write("rows/Lifted.tsx", "export default () => <><ClampedText numberOfLines={1}>{name}</ClampedText><ListRowTitle numberOfLines={2} title={name} /></>;");
      write("rows/Comment.tsx", "// <Text numberOfLines={1}> is only mentioned here\nexport const hint = \"numberOfLines={1}\";");
      write("rows/__tests__/Row.test.tsx", "render(<Text numberOfLines={1}>x</Text>);");
      expect(rawLineClamps(root, ["src"]).sort()).toEqual(["src/rows/Animated.tsx:1", "src/rows/Hand.tsx:1", "src/rows/NameRow.tsx:3"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
