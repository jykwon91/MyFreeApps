export default function ListingFormError({ message }: { message?: string }) {
  return message ? <p className="text-xs text-red-600 mt-1">{message}</p> : null;
}
