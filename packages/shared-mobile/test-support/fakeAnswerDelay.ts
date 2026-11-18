/**
 * How long every answer from a test's fake server takes to arrive. A fake adapter answers in the
 * same tick, which lets a screen's data land inside the render that asked for it in some runs and
 * not others, depending on how the real timers in the loading chain line up, so a test that
 * asserts before its screen has loaded used to fail about one full run in five. Answering on a
 * later macrotask, after this delay, makes such a test fail every run, so it gets fixed to wait for
 * what it reads. Small enough to add little to a run's time.
 */
export const FAKE_ANSWER_DELAY_MS = 5;
