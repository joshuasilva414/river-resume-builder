import { type RichText, safeLinkSchema } from "@river/domain/workspace";
import { Extension, type JSONContent, Mark, mergeAttributes, Node } from "@tiptap/core";
import { history, redo, undo } from "@tiptap/pm/history";
import { keymap } from "@tiptap/pm/keymap";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useRef } from "react";
import { Button } from "~/components/ui/button";
export const proseExtensions = [
  Node.create({ name: "doc", topNode: true, content: "paragraph+" }),
  Node.create({
    name: "paragraph",
    group: "block",
    content: "inline*",
    parseHTML: () => [{ tag: "p" }],
    renderHTML: () => ["p", 0],
  }),
  Node.create({ name: "text", group: "inline" }),
  Mark.create({
    name: "bold",
    parseHTML: () => [{ tag: "strong" }, { tag: "b" }],
    renderHTML: () => ["strong", 0],
  }),
  Mark.create({
    name: "italic",
    parseHTML: () => [{ tag: "em" }, { tag: "i" }],
    renderHTML: () => ["em", 0],
  }),
  Mark.create({
    name: "link",
    inclusive: false,
    addAttributes: () => ({
      href: {
        default: null,
        parseHTML: (element) => {
          const value = element.getAttribute("href");
          return safeLinkSchema.safeParse(value).success ? value : null;
        },
      },
    }),
    parseHTML: () => [{ tag: "a[href]" }],
    renderHTML: ({ HTMLAttributes }) => [
      "a",
      mergeAttributes(HTMLAttributes, { rel: "noopener noreferrer" }),
      0,
    ],
  }),
  Extension.create({
    name: "proseHistory",
    addProseMirrorPlugins: () => [
      history(),
      keymap({ "Mod-z": undo, "Mod-Shift-z": redo, "Mod-y": redo }),
    ],
  }),
];
export function spansToJson(spans: RichText): JSONContent[] {
  return spans.flatMap((span) =>
    span.text
      ? [
          {
            type: "text",
            text: span.text,
            marks: [
              ...(span.bold ? [{ type: "bold" }] : []),
              ...(span.italic ? [{ type: "italic" }] : []),
              ...(span.href ? [{ type: "link", attrs: { href: span.href } }] : []),
            ],
          },
        ]
      : [],
  );
}
export function jsonToSpans(json: JSONContent): RichText {
  if (json.type === "text")
    return [
      {
        text: json.text ?? "",
        ...(json.marks?.some((mark) => mark.type === "bold") ? { bold: true } : {}),
        ...(json.marks?.some((mark) => mark.type === "italic") ? { italic: true } : {}),
        ...(() => {
          const href = json.marks?.find((mark) => mark.type === "link")?.attrs?.href;
          return typeof href === "string" && safeLinkSchema.safeParse(href).success ? { href } : {};
        })(),
      },
    ];
  return (json.content ?? []).flatMap((child, index) => [
    ...(child.type === "paragraph" && index > 0 ? [{ text: "\n" }] : []),
    ...jsonToSpans(child),
  ]);
}
export function RichTextInput({
  value,
  onChange,
  label = "Value",
}: {
  value: RichText;
  onChange: (value: RichText) => void;
  label?: string;
}) {
  const callback = useRef(onChange);
  callback.current = onChange;
  const editor = useEditor({
    extensions: proseExtensions,
    immediatelyRender: false,
    content: { type: "doc", content: [{ type: "paragraph", content: spansToJson(value) }] },
    editorProps: {
      attributes: {
        class: "min-h-24 p-3 outline-none",
        role: "textbox",
        "aria-label": label,
        "aria-multiline": "true",
      },
    },
    onUpdate: ({ editor }) => callback.current(jsonToSpans(editor.getJSON())),
  });
  useEffect(() => {
    if (editor && JSON.stringify(jsonToSpans(editor.getJSON())) !== JSON.stringify(value))
      editor.commands.setContent(
        { type: "doc", content: [{ type: "paragraph", content: spansToJson(value) }] },
        { emitUpdate: false },
      );
  }, [editor, value]);
  return (
    <div className="rounded border">
      <div className="flex gap-1 border-b p-1">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label="Bold"
          onClick={() => editor?.chain().focus().toggleMark("bold").run()}
        >
          <strong>B</strong>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label="Italic"
          onClick={() => editor?.chain().focus().toggleMark("italic").run()}
        >
          <em>I</em>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            const href = window.prompt("Link URL (https, mailto, or tel)");
            if (href && safeLinkSchema.safeParse(href).success)
              editor?.chain().focus().setMark("link", { href }).run();
          }}
        >
          Link
        </Button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
