import { env } from "cloudflare:workers";
import { createRepository, schema } from "@river/db";
import {
  type Composition,
  type LibraryData,
  newId,
  type Principal,
  placeSection,
} from "@river/domain";
export async function compositionFixture() {
  const repository = createRepository(env.DB),
    id = newId();
  const actor: Principal = { kind: "owner", id, ownerId: id };
  await repository.db.insert(schema.user).values({
    id,
    email: `${id}@example.test`,
    name: "Composition fixture",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const job = await repository.runJobCommand(actor, {
    type: "create",
    idempotencyKey: "job",
    details: { role: "Synthetic role", company: "Fixture", location: "" },
    posting: { text: "Synthetic posting", url: null },
  });
  const jobDetail = await repository.inspectJob(id, { id: job.id });
  const save = async (data: LibraryData, key: string) => {
    const outcome = await repository.saveLibrary(actor, {
      id: null,
      revision: null,
      label: key,
      rationale: "Synthetic fixture",
      data,
      idempotencyKey: key,
    });
    if (!outcome.revisionId) throw Error("Missing library revision");
    return { itemId: outcome.id, revisionId: outcome.revisionId };
  };
  const name = await save(
    { kind: "content", type: "contact", wording: "Synthetic Person", evidence: [] },
    "name",
  );
  const header = await save(
    {
      kind: "block",
      type: "contact",
      fields: [{ key: "name", contents: [{ id: newId(), ...name }] }],
    },
    "header",
  );
  const contact = await save(
    { kind: "section", type: "contact", heading: "", blocks: [{ id: newId(), ...header }] },
    "contact",
  );
  const content = await save(
    { kind: "content", type: "summary", wording: "Original synthetic wording.", evidence: [] },
    "wording",
  );
  const block = await save(
    {
      kind: "block",
      type: "summary",
      fields: [{ key: "paragraphs", contents: [{ id: newId(), ...content }] }],
    },
    "summary-block",
  );
  const section = await save(
    { kind: "section", type: "summary", heading: "Summary", blocks: [{ id: newId(), ...block }] },
    "summary-section",
  );
  const graph = await repository.libraryGraph(id, [contact, section]);
  const data: Composition = {
    name: "Fixture draft",
    theme: "classic",
    templateRevision: 2,
    sections: [placeSection(contact, graph), placeSection(section, graph)],
  };
  const create = async (key: string, composition = data) =>
    repository.createResume(actor, {
      idempotencyKey: key,
      jobId: job.id,
      jobRevision: job.revision,
      snapshotId: jobDetail.snapshot.id,
      data: composition,
    });
  const draft = await create("draft");
  return { repository, actor, jobDetail, save, content, data, draft, create };
}
