/**
 * The part of a response body's ``ReadableStream<Uint8Array>`` the turn reader uses.
 * Structural, so web's DOM stream and the phone's ``expo/fetch`` stream both fit
 * without this package naming either platform's type.
 */
export interface TurnByteStream {
  getReader(): {
    read(): Promise<{ done: boolean; value?: Uint8Array }>;
    releaseLock(): void;
  };
}
