/* global require, module */
// Reanimated's official Jest support: its resolver points Reanimated and its worklets runtime at their web
// implementations, which run under Jest, where the native ones need native modules. It hands everything else on to
// the preset's own resolver, which jest-expo sets and this config would otherwise replace. Each app has its own
// jest-expo, so the preset is the one the project under test (its rootDir) resolves, not the one beside this file.
const reanimatedResolver = require("react-native-reanimated/jest/resolver");

const presetResolvers = new Map();

// Jest passes rootDir when it resolves a test's modules. While it validates the config (the transform and setup
// file paths) it passes none, but resolves from the rootDir itself, so basedir is the rootDir there.
function projectRootOf(options) {
  const rootDir = options.rootDir ?? options.basedir;
  if (!rootDir) {
    throw new Error(
      "packages/shared-mobile/jest/resolver.js was called with neither rootDir nor basedir, so it can't tell which " +
        "project's jest-expo preset to hand modules on to. Use it only as a jest config's resolver.",
    );
  }
  return rootDir;
}

function presetResolverFor(rootDir) {
  if (!presetResolvers.has(rootDir)) {
    const { resolver } = require(require.resolve("jest-expo/jest-preset", { paths: [rootDir] }));
    presetResolvers.set(rootDir, require(resolver));
  }
  return presetResolvers.get(rootDir);
}

module.exports = (request, options) => {
  const presetResolver = presetResolverFor(projectRootOf(options));
  return reanimatedResolver(request, {
    ...options,
    defaultResolver: (path, resolved) => presetResolver(path, { ...resolved, defaultResolver: options.defaultResolver }),
  });
};
