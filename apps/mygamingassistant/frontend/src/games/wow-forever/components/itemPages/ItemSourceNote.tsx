import { DETAIL_CHIP } from "@/games/wow-forever/components/food/detail/detailStyles";

/** "Classic source — may differ in Forever" / "Forever game files", once per section. */
export default function ItemSourceNote({ label }: { label: string }) {
  return <span className={DETAIL_CHIP}>{label}</span>;
}
