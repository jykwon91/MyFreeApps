/** What the crash guard reads from a page to count its main landmarks. A Playwright Page is one. */
export interface MainLandmarkPage {
  isClosed(): boolean;
  url(): string;
  getByRole(role: "main", options: { includeHidden: boolean }): { count(): Promise<number> };
}
