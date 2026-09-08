import { type Guide, GuideLink } from "../shared";

export const evidenceModel = {
  slug: "evidence-model",
  title: "Evidence and résumé content",
  description: "How sources, evidence, content fields, and layouts support a tailored résumé.",
  group: "Explanation",
  sections: [
    {
      id: "separation",
      title: "Each record has a different purpose",
      body: (
        <>
          <p>
            A source keeps original material such as a résumé, transcript, or project notes.
            Evidence keeps facts and skills you want to reuse. Source links are optional; you can
            enter evidence from your own knowledge.
          </p>
          <p>
            Résumé content holds the values you choose to present for an application. A schema
            defines those fields, and a layout renders them. The values can stay the same while the
            presentation changes.
          </p>
        </>
      ),
    },
    {
      id: "example",
      title: "From a project fact to an entry",
      body: (
        <>
          <p>
            Suppose your notes say you built a React booking form with input validation. You can
            save that as Experience evidence and save React as Skill evidence.
          </p>
          <p>
            In an Experience Entry, Fill from evidence can bring selected accomplishments into the
            entry. Review the values and add the known title, organization, and dates. The layout
            then determines their placement in the PDF.
          </p>
          <p>
            Neither extraction nor filling should add a percentage improvement, a larger role, or a
            date absent from the selected information. Unknown details stay empty for you to
            complete.
          </p>
        </>
      ),
    },
    {
      id: "verification",
      title: "Review belongs at the point of use",
      body: (
        <>
          <p>
            Source extraction gives you an editable import review. Adding the chosen items saves
            usable evidence. There is no required verification workflow afterward.
          </p>
          <p>
            You still decide whether wording accurately describes your experience. Before adding
            imported evidence or applying wording, compare the result with what you know. Historical
            verification decisions remain available without controlling current use or export.
          </p>
        </>
      ),
    },
    {
      id: "job-selection",
      title: "Choose relevant facts for the job",
      body: (
        <>
          <p>
            Job qualifications guide which evidence matters for an application. Selecting evidence
            does not automatically create a section or claim that you satisfy every requirement.
          </p>
          <p>
            Eligibility items, such as work authorization or location, remain informational. River
            does not infer answers about your circumstances from the résumé.
          </p>
          <p>
            Use the selected facts when composing entries. A tailored résumé can emphasize different
            supported facts while earlier saved versions retain their original wording.
          </p>
        </>
      ),
    },
    {
      id: "further-reading",
      title: "Related guides",
      body: (
        <>
          <p>
            <GuideLink slug="evidence">Build your evidence library</GuideLink> covers direct entry
            and source imports. <GuideLink slug="library">Build reusable sections</GuideLink> covers
            fields, nested entries, and layouts.{" "}
            <GuideLink slug="saved-versions">Saved versions and local changes</GuideLink> explains
            how earlier work is preserved.
          </p>
        </>
      ),
    },
  ],
} as const satisfies Guide;
