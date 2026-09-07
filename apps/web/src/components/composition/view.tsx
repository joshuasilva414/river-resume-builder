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
        <p className="eyebrow">{data.template ? "Custom template" : `${data.theme} template`}</p>
      </div>
      {data.sections.map((section) => (
        <section key={section.id} className="space-y-4 border-t pt-4">
          <h3 className="font-editorial text-2xl">{section.heading || "Contact / header"}</h3>
          {provenance && section.reason && (
            <p className="text-xs break-all">Changed for this résumé: {section.reason}</p>
          )}
          {section.blocks.map((block) => (
            <article key={block.id} className="space-y-3 border-l-2 pl-4">
              {provenance && block.reason && (
                <p className="text-xs break-all">Changed for this résumé: {block.reason}</p>
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
                              {content.override && (
                                <p className="mt-2 text-xs break-all">
                                  Wording changed: {content.override.reason}
                                </p>
                              )}
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
      {!data.sections.length && <p>No sections yet.</p>}
    </div>
  );
}
