/** How the compact frame sits in the window, measured in the page. */
export interface FrameMetrics {
  main: { width: number; height: number; scrollWidth: number; clientWidth: number };
  documentScrollWidth: number;
  windowWidth: number;
  windowHeight: number;
  windowScrollY: number;
  /** Elements other than <main> that scroll vertically (a second scrollbar). */
  nestedScrollers: string[];
}
