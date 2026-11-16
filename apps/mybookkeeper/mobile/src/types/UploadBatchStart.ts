/** A sent zip the server is now reading as a batch of documents. */
export interface UploadBatchStart {
  uri: string;
  batchId: string;
}
