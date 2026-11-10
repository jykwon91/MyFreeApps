import { SegmentedControl } from "@platform/mobile";
import { ADD_APPLICATION_MESSAGES as MESSAGES, ADD_APPLICATION_SOURCES } from "../../constants/addApplication";
import type { SourceStepProps } from "../../types/SourceStepProps";
import LinkSourceFields from "./LinkSourceFields";
import ManualSourceFields from "./ManualSourceFields";
import TextSourceFields from "./TextSourceFields";

/** The website's three ways in: a link (first, as there), pasted text, or typed by hand. */
export default function SourceStep(props: SourceStepProps) {
  const { source, reading } = props;
  return (
    <>
      <SegmentedControl
        accessibilityLabel={MESSAGES.sourceLabel}
        disabled={reading !== null}
        onChange={props.onSourceChange}
        segments={ADD_APPLICATION_SOURCES}
        value={source}
      />
      {source === "url" ? (
        <LinkSourceFields
          disabled={false}
          isLongRunning={props.isLongRunning}
          isReading={reading === "url"}
          onChange={props.onUrlChange}
          onPaste={props.onPasteLink}
          onRead={() => props.onReadLink()}
          value={props.urlValue}
        />
      ) : null}
      {source === "text" ? (
        <TextSourceFields
          error={props.textError}
          isLongRunning={props.isLongRunning}
          isReading={reading === "text"}
          onChange={props.onTextChange}
          onRead={props.onReadText}
          value={props.textValue}
        />
      ) : null}
      {source === "manual" ? <ManualSourceFields onChooseCompany={props.onChooseCompany} /> : null}
    </>
  );
}
