// react-native's jest preset reads the clock through `jest.now()` inside its
// requestAnimationFrame timer. Redux Toolkit schedules one up to 500ms after a
// component unmounts, so it can fire after teardown, where reading `jest` throws
// and fails a run that has only one test file.
global.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);
