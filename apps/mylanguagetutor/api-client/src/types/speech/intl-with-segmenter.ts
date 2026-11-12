import type { SegmenterConstructor } from "./segmenter-constructor";

/** ``Intl``, which has ``Segmenter`` in browsers but not in the phone's Hermes engine. */
export interface IntlWithSegmenter {
  Segmenter?: SegmenterConstructor;
}
