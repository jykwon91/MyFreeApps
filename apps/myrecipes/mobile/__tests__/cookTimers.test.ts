import { formatTimeLeft, formatTimerDuration, secondsLeft, spokenTimeLeft } from "../src/utils/formatCookTimer";
import { parseStepTimers } from "../src/utils/parseStepTimers";

const seconds = (instruction: string) => parseStepTimers(instruction).map((timer) => timer.seconds);

describe("parseStepTimers", () => {
  it.each([
    ["Simmer for 10 minutes.", 600],
    ["Bake at 350 - 25 minutes.", 1500],
    ["Bake at 180 — 20 minutes", 1200],
    ["Gas mark 4 - 30 minutes.", 1800],
    ["Step 2 - 5 minutes.", 300],
    ["Rest three-quarters of an hour.", 2700],
    ["Roast 1 and 1/2 hours.", 5400],
    ["Roast 1 and ½ hours.", 5400],
    ["Roast an hour and a quarter.", 4500],
    ["Cook 5 more minutes.", 300],
    ["Cook 5 additional minutes.", 300],
    ["Rest 10 minutes before slicing.", 600],
    ["Rest 1 hour 30 minutes before slicing.", 5400],
    ["Rest 45 seconds.", 45],
    ["Bake 1 hr.", 3600],
    ["Chill 2 hours", 7200],
    ["Bake about 5 min", 300],
    ["Cook 20 mins", 1200],
    ["Soften until it browns, about ten minutes.", 600],
    ["Stir for a minute.", 60],
    ["Roast for an hour.", 3600],
    ["Simmer for an hour and a half, stirring.", 5400],
    ["Bake one and a half hours", 5400],
    ["Bake 1.5 hours", 5400],
    ["Rest half an hour.", 1800],
    ["Rest for half hour.", 1800],
    ["Roast 1 hour 30 minutes", 5400],
    ["Roast 1 hour and 30 minutes", 5400],
    ["Roast 2 hrs, 15 mins", 8100],
    ["Braise 1 to 2 hours", 3600],
    ["Saute 5-10 minutes", 300],
    ["Saute 5 – 10 minutes", 300],
    ["Fry 3 or 4 minutes", 180],
    ["SIMMER 10 MINUTES", 600],
    ["Rest forty-five minutes", 2700],
    ["Rest forty five minutes", 2700],
    ["Rest twenty-five minutes", 1500],
    ["Rest thirteen minutes", 780],
    ["Rest seventy minutes", 4200],
    ["Roast 3/4 hour", 2700],
    ["Roast 1/2 hour", 1800],
    ["Roast 1 1/2 hours", 5400],
    ["Roast 1-1/2 hours", 5400],
    ["Roast 2 1/2 hours", 9000],
    ["Roast about 1 1/4 hours", 4500],
    ["Roast 1½ hours", 5400],
    ["Roast ½ hour", 1800],
    ["Roast 1,5 hours", 5400],
    ["Stir for half a minute", 30],
    ["Rest a quarter of an hour", 900],
    ["Rest three quarters of an hour", 2700],
    ["Rest a half-hour", 1800],
    ["Rest a half hour", 1800],
    ["Bake 10min", 600],
    ["Bake 1hr 30min", 5400],
    ["Bake 1h 30m", 5400],
    ["Bake 10\u00a0minutes", 600],
    ["Bake 10  minutes", 600],
    ["Bake 10\nminutes", 600],
    ["Roast 30 minutes to 1 hour", 1800],
    ["Roast 30 minutes to an hour", 1800],
    ["Roast 5 minutes to 10 minutes", 300],
    ["Roast half an hour to an hour", 1800],
    ["Sear 30 seconds to a minute", 30],
    ["Sear 10 min - 15 min", 600],
    ["Roast one to one and a half hours", 3600],
    ["Roast 25—30 minutes", 1500],
    ["Roast 1 1/2 to 2 hours", 5400],
    ["Boil 1 minute 30 seconds", 90],
    ["Boil 1 min 30 sec", 90],
    ["Boil 2 minutes and 30 seconds", 150],
    ["Bake 1 hour, 10 minutes and 5 seconds", 4205],
    ["Sear thirty seconds", 30],
  ])("reads %s", (instruction, expected) => {
    expect(seconds(instruction)).toEqual([expected]);
  });

  it.each([
    "Preheat the oven to 350 degrees.",
    "Can be made up to 2 hours ahead.",
    "Serve within an hour.",
    "Total time: 45 minutes.",
    "Serve with ten minute oats.",
    "Top with five minute frosting.",
    "Use two hour dough.",
    "Add two second layers.",
    "Add 1 second layer.",
    "Stir each 10 minutes.",
    "Microwave in 30 seconds intervals",
    "Add 2 cups of flour and 1 tsp salt.",
    "Serve with 5-minute oats.",
    "Wait a few minutes.",
    "Wait a couple of minutes.",
    "Simmer for 0 minutes.",
    "Ferment for 25 hours.",
    "Add a second layer.",
    "Stir every 5 minutes.",
    "Minutes matter here.",
    "Use the 2nd hour mark.",
    "Stir every 10 to 15 minutes.",
    "Stir every 5-10 minutes.",
    "Stir every half hour.",
    "Stir every one and a half hours.",
    "Stir every 1 hour 30 minutes.",
    "Serve with 5 minute oats.",
    "Add one second layer.",
    "Wait 0.1 seconds.",
    "It's 10 am.",
    "Ah, an m and a h.",
    "Half the butter.",
    "Save a quarter of the sauce.",
    "",
  ])("ignores %j", (instruction) => {
    expect(seconds(instruction)).toEqual([]);
  });

  it("finds each different wait once, in order, skipping an interval", () => {
    expect(seconds("Boil 10 minutes, stir every 2 minutes, rest 5 minutes, then boil 10 minutes.")).toEqual([600, 300]);
  });

  it("keeps two waits apart when they aren't one time", () => {
    expect(seconds("Boil 10 minutes and 5 minutes more.")).toEqual([600, 300]);
    expect(seconds("Roast 1 hour. Rest 10 minutes.")).toEqual([3600, 600]);
  });

  it("doesn't run the next clause into a time", () => {
    expect(seconds("Simmer 1 hour, and 10 minutes before the end add the peas.")).toEqual([3600, 600]);
    expect(seconds("Bake 1 hour, 10 minutes before serving remove foil")).toEqual([3600, 600]);
  });

  it("keeps a shorter next time rather than losing it", () => {
    expect(seconds("Roast 1 hour - 10 minutes rest.")).toEqual([3600, 600]);
    expect(seconds("Roast 1 hour or 10 minutes covered")).toEqual([3600, 600]);
  });

  it("allows exactly a day", () => {
    expect(seconds("Marinate 24 hours")).toEqual([86400]);
  });
});

describe("timer formatting", () => {
  it.each([
    [45, "45 sec"],
    [600, "10 min"],
    [3600, "1 hr"],
    [5400, "1 hr 30 min"],
    [3661, "1 hr 1 min 1 sec"],
  ])("labels %i seconds", (total, label) => {
    expect(formatTimerDuration(total)).toBe(label);
  });

  it.each([
    [581, "9:41"],
    [5, "0:05"],
    [3725, "1:02:05"],
  ])("shows %i seconds as a clock", (total, label) => {
    expect(formatTimeLeft(total)).toBe(label);
  });

  it.each([
    [30, "less than a minute"],
    [60, "about 1 minute"],
    [61, "about 2 minutes"],
    [600, "about 10 minutes"],
  ])("says %i seconds in words", (total, words) => {
    expect(spokenTimeLeft(total)).toBe(words);
  });

  it("rounds up, and stops at zero", () => {
    const timer = { endsAt: 1500, seconds: 60 };
    expect(secondsLeft(timer, 1000)).toBe(1);
    expect(secondsLeft(timer, 1500)).toBe(0);
    expect(secondsLeft(timer, 9000)).toBe(0);
  });

  it("never shows more than the timer's length", () => {
    expect(secondsLeft({ endsAt: 601_000, seconds: 600 }, 0)).toBe(600);
  });
});
