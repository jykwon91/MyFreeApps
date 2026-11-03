const { getDefaultConfig } = require("expo/metro-config");

// Expo finds the npm workspace root by itself and adds it to Metro's watch folders
// and module paths, so shared packages and hoisted dependencies resolve with no
// extra config. `new_mobile`'s CI job runs `expo export` to prove that keeps working.
module.exports = getDefaultConfig(__dirname);
