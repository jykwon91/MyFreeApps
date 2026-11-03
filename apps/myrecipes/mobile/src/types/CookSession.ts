/** Plain data, ready to be saved to the device once there's a store for it. */
export interface CookSession {
  versionId: string;
  pageIndex: number;
  checked: string[];
  updatedAt: number;
}
