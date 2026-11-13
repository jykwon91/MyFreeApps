export interface MockedConfigOptions {
  /** The dev server port the suite starts and browses; PW_PORT overrides it. */
  port: string;
  /**
   * The suite's folder under e2e/, "mocked" unless given. Results go to
   * e2e/test-results-<suite>/. An app whose dev server needs a build flag for
   * some specs keeps them in a second suite with its own config.
   */
  suite?: string;
  /** Environment for the dev server, such as a VITE_* flag the suite's build needs. */
  env?: Record<string, string>;
}
