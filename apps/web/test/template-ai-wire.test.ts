import { builtInSchemaBundle } from "@river/domain";
import {
  fixedPack,
  TEMPLATE_FIXTURE_VERSION,
  type TemplateAiInput,
  TemplateAiOutput,
  type TemplateAiProfile,
  templateCandidate,
  templateFixtures,
} from "@river/templates";
import { Schema } from "effect";
import { expect, it } from "vitest";
import {
  generateTemplateCandidate,
  templateAiOutputSchema,
} from "../src/server/template-ai-provider";

const input: TemplateAiInput = {
  type: "template-generation",
  scope: { level: "document", type: null },
  brief: {
    structure: "Single column",
    density: "Comfortable",
    character: "Preserve the current design",
    constraints: "Keep every existing field and layout",
  },
  baseGraph: { ...fixedPack("classic"), composition: builtInSchemaBundle },
  destination: { id: "01a08073-10f3-7e2e-891e-0ea4d05f48a7", revision: 1, manifestRevision: 2 },
  fixtureSet: {
    version: TEMPLATE_FIXTURE_VERSION,
    digest: "a".repeat(64),
    fixtures: templateFixtures,
  },
};
const legacyOutput: TemplateAiOutput = {
  source: input.baseGraph.document.source,
  overrides: { font: null, bodySize: null, sectionSpacing: null, margin: null },
  explanation: "Preserve the existing template design.",
};
const WireRequest = Schema.Struct({
  instructions: Schema.String,
  text: Schema.Struct({
    format: Schema.Struct({ strict: Schema.Boolean, schema: Schema.Json }),
  }),
});

function assertStrictObjects(value: unknown, path = "#") {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) assertStrictObjects(item, `${path}/${index}`);
    return;
  }
  for (const keyword of [
    "allOf",
    "oneOf",
    "not",
    "dependentRequired",
    "dependentSchemas",
    "if",
    "then",
    "else",
  ])
    expect(value, path).not.toHaveProperty(keyword);
  if ("properties" in value && value.properties && typeof value.properties === "object") {
    expect("required" in value ? value.required : [], path).toEqual(
      expect.arrayContaining(Object.keys(value.properties)),
    );
    expect("additionalProperties" in value && value.additionalProperties, path).toBe(false);
  }
  for (const [key, nested] of Object.entries(value)) assertStrictObjects(nested, `${path}/${key}`);
}

it.each(["river-template-generation-v1", "river-template-generation-v4"] as const)(
  "%s sends a complete strict schema through the OpenAI SDK with nullable composition",
  async (contract) => {
    const profile: TemplateAiProfile = {
      connection: { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", revision: 0, provider: "openai" },
      contract,
      model: "gpt-5.6-luna",
      maxInputCharacters: 160000,
      maxOutputTokens: 12000,
      timeoutMs: 60000,
    };
    const output = { ...legacyOutput, composition: null };
    const requests: (typeof WireRequest.Type)[] = [];
    const generated = await generateTemplateCandidate(
      "synthetic-key",
      input,
      profile,
      async (_url, init) => {
        const body = Schema.decodeUnknownSync(WireRequest)(JSON.parse(String(init?.body)));
        requests.push(body);
        return Response.json({
          id: "synthetic",
          object: "response",
          created_at: 1,
          model: profile.model,
          status: "completed",
          output: [
            {
              id: "synthetic-message",
              type: "message",
              role: "assistant",
              status: "completed",
              content: [{ type: "output_text", text: JSON.stringify(output), annotations: [] }],
            },
          ],
        });
      },
    );
    expect(generated).toEqual(output);
    expect(requests).toHaveLength(1);
    const body = requests[0];
    if (!body) throw new Error("Missing provider request");
    expect(body.text.format.strict).toBe(true);
    assertStrictObjects(body.text.format.schema);
    expect(body.text.format.schema).toMatchObject({
      required: expect.arrayContaining(["composition"]),
      properties: {
        composition: { anyOf: expect.arrayContaining([{ type: "null" }]) },
      },
    });
    expect(body.instructions).toContain("Always include composition");
  },
);

it("retains all schema array bounds as direct provider constraints", () => {
  expect(templateAiOutputSchema()).toMatchObject({
    properties: {
      composition: {
        anyOf: expect.arrayContaining([
          expect.objectContaining({
            properties: expect.objectContaining({
              schemas: expect.objectContaining({
                minItems: 1,
                maxItems: 50,
                items: expect.objectContaining({
                  properties: expect.objectContaining({
                    fields: expect.objectContaining({ minItems: 1, maxItems: 50 }),
                  }),
                }),
              }),
              layouts: expect.objectContaining({ minItems: 1, maxItems: 100 }),
            }),
          }),
        ]),
      },
    },
  });
});

it("keeps older persisted output readable and preserves its captured schema bundle", () => {
  expect(Schema.decodeUnknownSync(TemplateAiOutput)(legacyOutput)).toEqual(legacyOutput);
  expect(templateCandidate(input, legacyOutput).graph.composition).toEqual(builtInSchemaBundle);
  expect(
    templateCandidate(input, { ...legacyOutput, composition: null }).graph.composition,
  ).toEqual(builtInSchemaBundle);
});
