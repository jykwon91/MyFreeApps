const REVIEW_QUEUE_CHANNEL_LABELS: Record<string, string> = {
  airbnb: "Airbnb",
  furnished_finder: "Furnished Finder",
  booking_com: "Booking.com",
  vrbo: "Vrbo",
};

export function reviewQueueChannelLabel(channel: string): string {
  return REVIEW_QUEUE_CHANNEL_LABELS[channel] ?? channel;
}
