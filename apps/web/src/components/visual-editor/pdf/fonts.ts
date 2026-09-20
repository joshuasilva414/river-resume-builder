import sansItalic from "@fontsource/instrument-sans/files/instrument-sans-latin-400-italic.woff?url";
import sansRegular from "@fontsource/instrument-sans/files/instrument-sans-latin-400-normal.woff?url";
import sansBoldItalic from "@fontsource/instrument-sans/files/instrument-sans-latin-700-italic.woff?url";
import sansBold from "@fontsource/instrument-sans/files/instrument-sans-latin-700-normal.woff?url";
import serifItalic from "@fontsource/newsreader/files/newsreader-latin-400-italic.woff?url";
import serifRegular from "@fontsource/newsreader/files/newsreader-latin-400-normal.woff?url";
import serifBoldItalic from "@fontsource/newsreader/files/newsreader-latin-700-italic.woff?url";
import serifBold from "@fontsource/newsreader/files/newsreader-latin-700-normal.woff?url";

export const documentFonts = [
  {
    family: "River Sans",
    fonts: [
      { src: sansRegular, fontWeight: 400, fontStyle: "normal" },
      { src: sansBold, fontWeight: 700, fontStyle: "normal" },
      { src: sansItalic, fontWeight: 400, fontStyle: "italic" },
      { src: sansBoldItalic, fontWeight: 700, fontStyle: "italic" },
    ],
  },
  {
    family: "River Serif",
    fonts: [
      { src: serifRegular, fontWeight: 400, fontStyle: "normal" },
      { src: serifBold, fontWeight: 700, fontStyle: "normal" },
      { src: serifItalic, fontWeight: 400, fontStyle: "italic" },
      { src: serifBoldItalic, fontWeight: 700, fontStyle: "italic" },
    ],
  },
] as const;
export const fontManifest = "instrument-sans/newsreader:5.3.0:static-latin:400,700:normal,italic";
