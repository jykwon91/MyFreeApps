import { describe, expect, it } from "vitest";
import type { RankTrainer } from "@/games/wow-forever/data/professions/rankTrainerTypes";
import { recipeRank, trainersTeaching } from "@/games/wow-forever/lib/recipes/recipeTrainers";

const trainer = (npcId: number, name: string): RankTrainer =>
  ({ npcId, name, zoneId: 1, city: false } as RankTrainer);

describe("recipeRank", () => {
  it("picks the rank you'd have trained by the recipe's skill", () => {
    expect(recipeRank("tailoring", 205).name).toBe("Artisan");
    expect(recipeRank("tailoring", 200).name).toBe("Artisan");
    expect(recipeRank("tailoring", 199).name).toBe("Expert");
    expect(recipeRank("tailoring", 60).name).toBe("Journeyman");
  });

  it("uses the Journeyman trainers below 50", () => {
    expect(recipeRank("tailoring", 1).name).toBe("Journeyman");
  });
});

describe("trainersTeaching", () => {
  const list = [trainer(1, "A"), trainer(2, "B")];

  it("keeps the trainers whose list has the spell", () => {
    expect(trainersTeaching(list, 18401, { "2": [[18401, 205, 100]], "1": [[2385, 10, 45]] }).map((t) => t.name)).toEqual(["B"]);
  });

  it("keeps the whole rank list when the data isn't loaded or nobody has it", () => {
    expect(trainersTeaching(list, 18401, null)).toBe(list);
    expect(trainersTeaching(list, 18401, { "1": [[2385, 10, 45]] })).toBe(list);
  });
});
