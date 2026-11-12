import Svg, { Path, Rect } from "react-native-svg";
import { MIC_GLYPH_SIZE } from "../../constants/voice";
import type { MicGlyphProps } from "../../types/MicGlyphProps";

/** The microphone control's picture: decorative, the button carries the name. */
export default function MicGlyph({ listening, color }: MicGlyphProps) {
  return (
    <Svg accessible={false} fill="none" height={MIC_GLYPH_SIZE} stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24" width={MIC_GLYPH_SIZE}>
      {listening ? (
        <Rect fill={color} height={12} rx={2} width={12} x={6} y={6} />
      ) : (
        <>
          <Rect height={13} rx={3} width={6} x={9} y={2} />
          <Path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" />
        </>
      )}
    </Svg>
  );
}
