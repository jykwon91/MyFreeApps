/** What json() hands to route.fulfill(): a status and a JSON body. */
export interface JsonFulfillment {
  status: number;
  contentType: "application/json";
  body: string;
}
