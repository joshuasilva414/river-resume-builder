import {
  blockDefinitions,
  type Composition,
  contentValue,
  type LibraryGraphNode,
} from "@river/domain";
import { EvidenceLinks } from "~/components/library/evidence-links";
export function CompositionView({
  data,
  graph,
  provenance = false,
}: {
  data: Composition;
  graph: readonly LibraryGraphNode[];
  provenance?: boolean;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-editorial text-2xl">{data.name}</h3>
        <p className="eyebrow">
          {data.template
            ? `Custom template · ${data.template.revisionId}`
            : `${data.theme} · Template revision ${data.templateRevision}`}
        </p>
      </div>
      {data.sections.map((section) => (
        <section key={section.id} className="space-y-4 border-t pt-4">
          <h3 className="font-editorial text-2xl">{section.heading || "Contact / header"}</h3>
          {provenance && (
            <p className="text-xs break-all">
              Base Section {section.reference.revisionId}
              {section.reason && ` · Local composition: ${section.reason}`}
            </p>
          )}
          {section.blocks.map((block) => (
            <article key={block.id} className="space-y-3 border-l-2 pl-4">
              {provenance && (
                <p className="text-xs break-all">
                  Base Block {block.reference.revisionId}
                  {block.reason && ` · Local composition: ${block.reason}`}
                </p>
              )}
              {blockDefinitions[block.type].fields.map((field) => (
                <div key={field.key} className="space-y-3">
                  {block.fields
                    .find((item) => item.key === field.key)
                    ?.contents.map((content) => {
                      const value = contentValue(content, graph);
                      return (
                        <div key={content.id}>
                          <p className="whitespace-pre-wrap break-words text-[15px] leading-6">
                            {value.wording}
                          </p>
                          {provenance && (
                            <>
                              <p className="mt-2 text-xs break-all">
                                Base Content {content.reference.revisionId}
                                {content.override && ` · Local wording: ${content.override.reason}`}
                              </p>
                              <div className="mt-3">
                                <EvidenceLinks value={value.evidence} />
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                </div>
              ))}
            </article>
          ))}
        </section>
      ))}
      {!data.sections.length && <p>No Sections yet.</p>}
    </div>
  );
}
