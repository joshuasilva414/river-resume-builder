import type { Guide } from "../shared";

export const contentTypes = {
  slug: "content-types",
  title: "Content schemas and fields",
  description: "Standard section fields, nested entries, and the layouts that render their values.",
  group: "Reference",
  sections: [
    {
      id: "items",
      title: "Content, schemas, and layouts",
      body: (
        <>
          <dl>
            <dt>Content schema</dt>
            <dd>
              A named set of typed fields. Fields can hold text, numbers, dates, booleans, lists, or
              nested records.
            </dd>
            <dt>Entry</dt>
            <dd>
              A record such as one experience or education entry. It can be entered inline or reused
              from saved content.
            </dd>
            <dt>Section</dt>
            <dd>A record placed in a résumé, such as Summary or a list of Experience Entries.</dd>
            <dt>Layout</dt>
            <dd>
              The rendering instructions for a compatible schema. Different layouts can show the
              same saved values.
            </dd>
            <dt>Library label</dt>
            <dd>
              A private name for finding saved content. It is separate from a printed section
              heading.
            </dd>
          </dl>
          <p>
            Older Content items and blocks remain readable. New sections can use direct fields and
            nested entries without creating separate items for each value.
          </p>
        </>
      ),
    },
    {
      id: "contact",
      title: "Contact",
      body: (
        <>
          <p>
            Contact holds the name and optional contact details. Links can have a label and a
            destination. The résumé uses one Contact section first; include a name before rendering
            the document.
          </p>
        </>
      ),
    },
    {
      id: "summary",
      title: "Summary",
      body: (
        <>
          <p>
            Summary contains direct text. Type the summary into its field and select a compatible
            layout. A separate nested entry is unnecessary.
          </p>
        </>
      ),
    },
    {
      id: "experience",
      title: "Experience",
      body: (
        <>
          <p>
            Experience contains a list of Experience Entries. Each entry holds details such as
            title, employer, location, start and end dates, and accomplishments. Create and edit
            entries inside the section, then save them together.
          </p>
        </>
      ),
    },
    {
      id: "project",
      title: "Projects",
      body: (
        <>
          <p>
            Projects holds project entries with the project name, descriptive details, optional
            links, and accomplishments. Use known facts and leave unknown details empty.
          </p>
        </>
      ),
    },
    {
      id: "education",
      title: "Education",
      body: (
        <>
          <p>
            Education holds education entries. GPA is a numeric field. Date fields support a year,
            month and year, full date, or Present. Existing date text remains readable when opening
            older content.
          </p>
        </>
      ),
    },
    {
      id: "skill",
      title: "Skills",
      body: (
        <>
          <p>
            Skill lists use active evidence with type Skill. Saved skill values remain with existing
            content even when an evidence item later changes or moves to Trash.
          </p>
        </>
      ),
    },
    {
      id: "credential",
      title: "Credentials",
      body: (
        <>
          <p>
            Credentials holds records for certifications and other credentials. Enter names,
            issuers, and dates only when known. Custom schemas can define additional typed fields.
          </p>
        </>
      ),
    },
    {
      id: "composition",
      title: "Composition and compatibility",
      body: (
        <>
          <p>
            Fields can reference a named entry schema or a list of records. Each nested record uses
            a compatible layout. Schema and layout references are saved at specific versions so
            later edits do not silently change a résumé.
          </p>
          <p>
            Missing, incompatible, private, or circular references are rejected. Switching
            compatible layouts retains values, including fields the selected layout does not print.
          </p>
        </>
      ),
    },
  ],
} as const satisfies Guide;
