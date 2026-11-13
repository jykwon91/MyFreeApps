/** What plainText() hands to route.fulfill(): a status and a plain-text body. */
export interface TextFulfillment {
  status: number;
  contentType: "text/plain; charset=utf-8";
  body: string;
}
