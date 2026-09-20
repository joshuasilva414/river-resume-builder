import { Document, Font, Link, Page, type Styles, Text, View } from "@react-pdf/renderer";
import type { ResolvedDocument, ResolvedNode, VisualStyle } from "@river/domain/workspace";
import { documentFonts } from "./fonts";

for (const family of documentFonts)
  Font.register({ family: family.family, fonts: family.fonts.map((font) => ({ ...font })) });
// Disabling automatic hyphens makes extracted text match the author's words across line wraps.
Font.registerHyphenationCallback((word) => [word]);
export const rendererIdentity = "river-react-pdf/1:4.9.0";
export function pdfStyle(style: VisualStyle): Styles[string] {
  return {
    fontFamily: style.fontFamily
      ? style.fontFamily === "serif"
        ? "River Serif"
        : "River Sans"
      : undefined,
    fontSize: style.fontSize,
    fontWeight: style.weight === "bold" ? 700 : style.weight ? 400 : undefined,
    fontStyle: style.italic ? "italic" : undefined,
    color: style.color,
    textAlign: style.align,
    gap: style.gap,
    padding: style.padding,
    flexGrow: style.grow,
    width: style.width,
    borderBottomWidth: style.borderBottom ? 0.5 : undefined,
    borderBottomColor: "#d5d8e1",
  };
}
function PdfNode({ node }: { node: ResolvedNode }) {
  const style = pdfStyle(node.style);
  if (node.kind === "text")
    return (
      <Text style={{ ...style, lineHeight: 1.35 }} orphans={2} widows={2}>
        {node.bullet ? "•  " : ""}
        {node.spans.map((span, i) => {
          const childStyle: Styles[string] = {
            fontWeight: span.bold ? 700 : undefined,
            fontStyle: span.italic ? "italic" : undefined,
          };
          return span.href ? (
            <Link
              // biome-ignore lint/suspicious/noArrayIndexKey: A frozen PDF is rendered once and has no interactive span state.
              key={`${i}:${span.text}`}
              src={span.href}
              style={{
                ...childStyle,
                color: node.style.color ?? "#17191f",
                textDecoration: "none",
              }}
            >
              {span.text}
            </Link>
          ) : (
            <Text // biome-ignore lint/suspicious/noArrayIndexKey: A frozen PDF is rendered once and has no interactive span state.
              key={`${i}:${span.text}`}
              style={childStyle}
            >
              {span.text}
            </Text>
          );
        })}
      </Text>
    );
  return (
    <View
      style={{
        ...style,
        flexDirection: node.kind === "row" ? "row" : "column",
        ...(node.kind === "row" ? { alignItems: "baseline" } : {}),
      }}
      wrap={!node.style.keepTogether}
    >
      {node.children.map((child) => (
        <PdfNode key={child.id} node={child} />
      ))}
    </View>
  );
}
export function ResumePdf({ document, title }: { document: ResolvedDocument; title: string }) {
  return (
    <Document title={title} creator="River" producer={rendererIdentity} language="en-US">
      <Page
        size={document.page.size}
        style={{ ...pdfStyle(document.style), padding: document.page.margin, lineHeight: 1.35 }}
      >
        {document.children.map((node) => (
          <PdfNode key={node.id} node={node} />
        ))}
      </Page>
    </Document>
  );
}
