// biome-ignore-all lint/suspicious/noArrayIndexKey: This tree is serialized to static markup, with no mounted component state.
import {
  ContentRecord,
  contentLinkHref,
  type ResumeDocument,
  renderedScalarText,
  resolveContentLayout,
  resolveContentSchema,
  type SchemaBundle,
  scalarText,
} from "@river/domain";
import { effectiveStyles, fixedPack, type TemplateGraph } from "@river/templates";
import { Schema } from "effect";

function link(text: string, label = text) {
  const href = contentLinkHref(text);
  return href ? (
    <a href={href} target="_blank" rel="noreferrer">
      {label}
    </a>
  ) : (
    label
  );
}

/** Approximate supported field semantics. Custom LaTeX is never evaluated as HTML. */
function RecordView({
  bundle,
  record,
  exclude = [],
}: {
  bundle: SchemaBundle;
  record: ContentRecord;
  exclude?: readonly string[];
}) {
  const definition = resolveContentSchema(bundle, record.schema);
  if (definition.id === "contact-link") {
    const url = scalarText(record.values.url),
      label = scalarText(record.values.label);
    return <span>{link(url, label || url)}</span>;
  }
  const layout = resolveContentLayout(bundle, record.layout);
  const fields = definition.fields.filter((field) => !exclude.includes(field.id));
  const dates = fields.filter((field) => field.kind === "date");
  const headingIds: Record<string, readonly string[]> = {
    "experience-entry": ["employer", "title"],
    "education-entry": ["institution", "degree"],
    "project-entry": ["project"],
    "credential-entry": ["credential", "issuer"],
  };
  const headings = headingIds[definition.id] ?? [];
  const heading = headings.map((id) => scalarText(record.values[id])).filter(Boolean);
  const dateText = dates
    .map((field) => scalarText(record.values[field.id]))
    .filter(Boolean)
    .join(" – ");
  return (
    <div className={`record ${record.layout.id.endsWith("-compact") ? "compact" : "classic"}`}>
      {heading.length > 0 && (
        <div className="entry-heading">
          <div>
            <strong>{heading[0]}</strong>
            {heading.slice(1).map((text, index) => (
              <span className="entry-subtitle" key={`${index}-${text}`}>
                {text}
              </span>
            ))}
          </div>
          <span className="dates">{dateText}</span>
        </div>
      )}
      {fields
        .filter(
          (field) => !headings.includes(field.id) && !(heading.length && field.kind === "date"),
        )
        .map((field) => {
          const value = record.values[field.id];
          if (value === undefined || value === null || value === "") return null;
          if (field.kind === "record" || field.kind === "records") {
            const children = Schema.decodeUnknownSync(Schema.Array(ContentRecord))(
              field.kind === "record" ? [value] : value,
            );
            return (
              <div key={field.id} className={field.id === "links" ? "contact-links" : "entries"}>
                {children.map((child) => (
                  <RecordView key={child.id} bundle={bundle} record={child} />
                ))}
              </div>
            );
          }
          if (field.kind === "list") {
            const values = Schema.decodeUnknownSync(Schema.Array(Schema.Json))(value)
              .map(scalarText)
              .filter(Boolean);
            if (field.items === "skill" || field.id === "skills")
              return <p key={field.id}>{values.join(" · ")}</p>;
            return (
              <ul key={field.id}>
                {values.map((text, index) => (
                  <li key={`${index}-${text}`}>{text}</li>
                ))}
              </ul>
            );
          }
          const text = renderedScalarText(record, field, layout);
          return <p key={field.id}>{field.id === "url" ? link(text) : text}</p>;
        })}
    </div>
  );
}

export function ApproximateDocument({ document }: { document: ResumeDocument }) {
  const contact = document.structuredContact;
  return (
    <main className="resume">
      <header className="contact">
        <h1>{document.name}</h1>
        {contact ? (
          <RecordView bundle={contact} record={contact.record} exclude={["name"]} />
        ) : (
          <div className="contact-lines">
            {document.contact.map((line, index) => (
              <span key={`${index}-${line}`}>{line}</span>
            ))}
          </div>
        )}
      </header>
      {document.sections.map((section, index) => (
        <section key={section.locator ?? index} className="resume-section">
          <h2>{section.heading}</h2>
          {section.structured ? (
            <RecordView
              bundle={section.structured}
              record={section.structured.record}
              exclude={["heading"]}
            />
          ) : (
            section.blocks.map((block, index) =>
              block.structured ? (
                <RecordView
                  key={block.locator ?? index}
                  bundle={block.structured}
                  record={block.structured.record}
                />
              ) : (
                <div key={block.locator ?? index} className="record">
                  {block.heading && (
                    <div className="entry-heading">
                      <strong>{block.heading}</strong>
                      {block.detail && <span>{block.detail}</span>}
                    </div>
                  )}
                  {!block.heading && block.detail && <p>{block.detail}</p>}
                  {block.paragraphs.map((text, index) => (
                    <p key={`${index}-${text}`}>{text}</p>
                  ))}
                  {block.bullets.length > 0 && (
                    <ul>
                      {block.bullets.map((text, index) => (
                        <li key={`${index}-${text}`}>{text}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ),
            )
          )}
        </section>
      ))}
    </main>
  );
}

export function approximateStyles(theme: TemplateGraph["theme"], graph?: TemplateGraph | null) {
  const template = graph ?? fixedPack(theme);
  const styles = effectiveStyles(template.tokens, template.document.manifest);
  return `@page { size: letter; margin: ${styles.margin}in; }
    * { box-sizing: border-box; } :root { --preview-margin: ${styles.margin}in; } body { margin: 0; color: #111318; background: #f2f3f5; }
    .resume { font-family: ${styles.font === "Latin Modern Sans" ? "Arial, sans-serif" : "Georgia, serif"}; font-size: ${styles.bodySize}pt; line-height: 1.32; }
    h1, h2, p, ul { margin: 0; } h1 { font-size: 24pt; line-height: 1.1; margin-bottom: 7pt; }
    h2 { font-size: 12pt; line-height: 1.2; margin: ${styles.sectionSpacing}pt 0 5pt; padding-bottom: 3pt; ${theme !== "minimal" ? "border-bottom: 0.5pt solid #969ca6;" : ""} ${theme === "technical" ? "text-transform: uppercase; letter-spacing: .06em;" : ""} break-after: avoid; }
    p { margin-bottom: 3pt; overflow-wrap: anywhere; orphans: 2; widows: 2; }
    .record { margin-bottom: 7pt; } .entry-heading { display: flex; justify-content: space-between; gap: 12pt; break-after: avoid; margin-bottom: 3pt; }
    .entry-subtitle { display: block; } .compact .entry-subtitle { display: inline; } .compact .entry-subtitle::before { content: " · "; }
    .entry-heading > div { min-width: 0; flex: 1; } .dates { width: 30%; text-align: right; } ul { padding-left: 13pt; } li { padding-left: 1pt; margin-bottom: 2pt; orphans: 2; widows: 2; }
    a { color: inherit; text-decoration: none; overflow-wrap: anywhere; }
    .contact > .record, .contact-lines, .contact-links { display: flex; flex-wrap: wrap; column-gap: 10pt; row-gap: 2pt; }
    .contact .record { margin-bottom: 0; } .contact p { margin: 0; } .contact-links { display: contents; }
    .pagedjs_page { background: white; margin: 0 0 20px; }`;
}
