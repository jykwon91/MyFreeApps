const DATE_LENGTH = 10;
const TIME_START = 11;
const TIME_END = 16;

/** "yyyy-MM-ddTHH:mm" into the date and the time the two pickers edit. */
export function splitReceivedAt(value: string): { date: string; time: string } {
  return { date: value.slice(0, DATE_LENGTH), time: value.slice(TIME_START, TIME_END) };
}

export function joinReceivedAt(date: string, time: string): string {
  return `${date}T${time}`;
}
