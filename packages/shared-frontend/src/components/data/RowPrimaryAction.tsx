import { Link } from "react-router-dom";
import { cn } from "../../utils/cn";
import { stopRowClick } from "../../utils/stopRowClick";
import { warnNestedControl } from "../../utils/warnNestedControl";
import { FOCUS_RING_CLASS } from "../../constants/menu-item-focus";
import type { RowPrimaryActionProps } from "../../types/row-primary-action-props";

/**
 * The real control in a clickable table row's main cell, so keyboard and
 * screen-reader users can open the row while it keeps its table semantics.
 * It looks like the text it wraps, plus a focus ring. The row may still open
 * on a mouse click anywhere; a click here stops at this control so the row
 * doesn't open twice. Pass `className="block w-full"` to fill the cell.
 */
export default function RowPrimaryAction(props: RowPrimaryActionProps) {
  const className = cn("rounded-sm text-left", FOCUS_RING_CLASS, props.className);

  if ("to" in props) {
    return (
      <Link ref={warnNestedControl} to={props.to} onClick={stopRowClick} className={className} aria-label={props["aria-label"]}>
        {props.children}
      </Link>
    );
  }

  const { onActivate } = props;
  return (
    <button
      ref={warnNestedControl}
      type="button"
      onClick={(event) => {
        stopRowClick(event);
        onActivate();
      }}
      className={className}
      aria-label={props["aria-label"]}
    >
      {props.children}
    </button>
  );
}
