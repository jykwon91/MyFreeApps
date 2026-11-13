/** One sentence handed to the (faked) text-to-speech voice. */
export interface SpokenUtterance {
  text: string;
  lang: string;
  rate: number;
}
