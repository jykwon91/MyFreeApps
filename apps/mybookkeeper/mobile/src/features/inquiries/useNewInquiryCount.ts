import { useGetInquiriesQuery } from "@mybookkeeper/api-client/store/inquiriesApi";

/** New inquiries in the inbox, for the People tab. The total is all that's needed, so one row is enough. */
export function useNewInquiryCount(): number {
  const { data } = useGetInquiriesQuery({ stage: "new", inbox_only: true, limit: 1 });
  return data?.total ?? 0;
}
