# River

River is a private, account-isolated résumé builder. Each person controls their evidence, wording, reusable content, and saved résumés.

## Language

**Owner**:
The person who controls one private account and makes decisions about its content.
_Avoid_: Tenant, workspace member

**Administrator**:
The person who manages service usage, account allowances, and backups. Administrative access does not grant access to another person's résumé or source content.

**Source**:
A captured document or text from which evidence can be extracted. Evidence can also be entered without a source.
_Avoid_: Source artifact

**Evidence**:
A saved statement or skill with text, keywords, optional sources, and a type. Types are Skill, Achievement, Experience, Education, Credential, and Other.
_Avoid_: Claim, verified fact

**Entry**:
One record of related résumé information, such as a position, project, or education. Entries can be edited inside a section and reused independently.
_Avoid_: Block

**Section**:
A part of a résumé that contains direct text, nested entries, or both. A Summary contains text; Experience contains a list of Experience Entry records.

**Content schema**:
A named definition of the fields a section or entry accepts. Fields can contain scalar values, lists, or records described by another schema.

**Field identity**:
The stable meaning of a field across compatible schemas. Changing how a field is displayed does not change its identity or its value.

**Layout**:
A presentation of values conforming to one content schema. Compatible layouts use the same schema and can display the same content without conversion.

**Template**:
A reusable résumé design containing layouts and their required content schemas.

**Job**:
An employment opening with a current captured description and any earlier captures.
_Avoid_: Job target

**Job capture**:
A saved description and posting details from one point in time. Refreshing a posting preserves earlier captures and résumés.
_Avoid_: Job Posting Snapshot

**Qualification**:
A job requirement that can be supported by relevant evidence.

**Eligibility**:
An informational condition such as work authorization or location. River does not infer the person's answer or use eligibility as a résumé-creation gate.

**Résumé**:
A working document tailored to a job. Editing it does not silently change reusable content or another résumé.
_Avoid_: Draft aggregate

**Saved version**:
An immutable capture of a résumé and its exact content, job capture, and presentation. Restoring it creates a separate working branch.
_Avoid_: Checkpoint

**Trash**:
Recoverable deleted items. Deletion does not change content retained by saved résumés.
_Avoid_: Archived revisions

**AI connection**:
An account-owned credential for a chosen AI provider. Each task uses the explicitly selected provider and model.

**Wording alternative**:
An editable suggested wording change that the person chooses to apply.
_Avoid_: Proposal, candidate

**Scoring allowance**:
The number of successful scoring results an account may retain during a UTC day. Failed attempts and reuse of an existing result do not consume allowance.
