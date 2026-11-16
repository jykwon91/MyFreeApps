import { DEFAULT_FONT_SCALE, setFontScale } from "./fontScale";

// React Native's test setup reports double the default text size, which would test every row at a large text size.
beforeEach(() => setFontScale(DEFAULT_FONT_SCALE));
