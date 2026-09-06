import { blockDefinitions } from "@river/domain";
import type { Guide } from "../shared";

export const contentTypes = {
  slug: "content-types",
  title: "Content types and fields",
  description:
    "The structure of reusable content, blocks, and sections, including required fields.",
  group: "Reference",
  sections: [
    {
      id: "items",
      title: "Library items",
      body: (
        <>
          <dl>
            <dt>Content item</dt>
            <dd>A piece of résumé wording with optional links to Evidence Revisions.</dd>
            <dt>Block</dt>
            <dd>
              A collection of fields that contain Content items. The block type determines its
              fields.
            </dd>
            <dt>Section</dt>
            <dd>An ordered collection of Blocks of one type.</dd>
            <dt>Library label</dt>
            <dd>A private name used to find an item. The label is not printed.</dd>
            <dt>Section heading</dt>
            <dd>The heading printed above a section. Contact sections have no printed heading.</dd>
          </dl>
          <p>
            Names, dates, and contact details are explicit wording. An Owner profile update does not
            rewrite those values in existing content.
          </p>
        </>
      ),
    },
    // Derive fields and bounds from the same definitions used by the library editor.
    ...Object.entries(blockDefinitions).map(([type, definition]) => ({
      id: type,
      title: definition.label,
      body: (
        <>
          <p>
            The {definition.label} block has the following fields. Minimum and maximum specify how
            many content items each field accepts.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">{definition.label} fields and content limits</caption>
              <thead>
                <tr>
                  <th scope="col" className="border-b py-3 pr-4 font-semibold">
                    Field
                  </th>
                  <th scope="col" className="border-b py-3 pr-4 font-semibold">
                    Minimum
                  </th>
                  <th scope="col" className="border-b py-3 font-semibold">
                    Maximum
                  </th>
                </tr>
              </thead>
              <tbody>
                {definition.fields.map((field) => (
                  <tr key={field.key}>
                    <th scope="row" className="border-b py-3 pr-4 font-normal">
                      {field.label}
                    </th>
                    <td className="border-b py-3 pr-4">{field.min}</td>
                    <td className="border-b py-3">{field.max}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ),
    })),
    {
      id: "composition",
      title: "Résumé composition rules",
      body: (
        <>
          <p>
            A résumé has at most one contact section, placed first. A PDF preview requires a contact
            block with a name.
          </p>
          <p>
            Other sections and their blocks follow the saved reading order. A placed item refers to
            an exact library revision.
          </p>
          <p>
            An archived library item remains available through existing saved references.
            New-content pickers exclude archived items.
          </p>
        </>
      ),
    },
  ],
} as const satisfies Guide;
