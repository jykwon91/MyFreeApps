import { resetMockKeyboard } from "./mockKeyboard";

// The mock keyboard lives for a whole test file, so a test that opens it would leave the next one starting open.
beforeEach(resetMockKeyboard);
