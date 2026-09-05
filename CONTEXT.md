# Resume Builder

Resume Builder is a private, owner-directed system for turning sourced personal evidence into tailored resumes. Its language distinguishes factual records, reusable content, working compositions, and immutable history.

## Language

**Owner**:
The single person who controls the application and makes final decisions about evidence, wording, templates, and exports.
_Avoid_: User, administrator

**Owner Profile**:
The stable identity and contact information of the Owner used across resumes.
_Avoid_: Profile, candidate

**Employment**:
A period of work performed by the Owner for an employer or organization, independent of how it is described on a resume.
_Avoid_: Role, experience

**Project**:
A body of work created or materially contributed to by the Owner, independent of its resume presentation.
_Avoid_: Project entry

**Education**:
A program of study undertaken by the Owner, including its institution, qualification, and dates.
_Avoid_: Education entry

**Credential**:
A qualification, certification, award, or license issued to the Owner by another organization.
_Avoid_: Certification entry

**Agent Credential**:
A named, scoped identity through which an external agent accesses permitted application capabilities.
_Avoid_: API key, service account

**Source Artifact**:
An immutable captured input that preserves where potential evidence came from. It may contain externally authored material or an Owner attestation, but its existence does not determine whether a claim is verified.
_Avoid_: Evidence, attachment, source file

**Source Processing Result**:
An immutable derived representation of a Source Artifact produced by a named version of a parser or extractor.
_Avoid_: Parsed source, current extraction

**Evidence Citation**:
A precise link from an Evidence Revision to a supporting excerpt or location within a Source Artifact.
_Avoid_: Source link, provenance note

**Evidence Claim**:
The stable identity of one atomic factual assertion about the owner, linked to its supporting sources and context. A claim may be active or archived independently of the review state of its revisions.
_Avoid_: Evidence record, fact

**Evidence Revision**:
An immutable version of an Evidence Claim whose review state is Draft, Needs Clarification, or Verified. Verification applies to a specific revision rather than to the claim for all time, independently of what kind of Source Artifact supports it.
_Avoid_: Claim version, evidence version

**Evidence Verification**:
An explicit decision by the Owner or an authorized Agent Credential that an Evidence Revision accurately reflects its cited sources. It records the verifier and rationale while preserving whether a source is an Owner attestation.
_Avoid_: Approval, verified claim

**Resume Content Item**:
Reusable resume content such as a bullet, summary, skill, employment entry, project, education entry, or credential, independent of its placement and visual presentation.
_Avoid_: Resume-ready item, resume component

**Content Revision**:
An immutable version of a Resume Content Item that cites the exact Evidence Revisions supporting its wording.
_Avoid_: Content version, bullet version

**Content Override**:
A resume-specific wording variant that preserves its base Content Revision, exact supporting Evidence Revisions, and reason without changing the reusable library until the Owner explicitly promotes it.
_Avoid_: Local edit, custom text

**Resume Block**:
The stable identity of a reusable composition of content for one block type, independent of its use in any one Resume Draft.
_Avoid_: Block instance, component

**Block Revision**:
An immutable, presentation-neutral composition that binds exact Content Revisions to a Resume Block's typed fields and preserves its semantic options.
_Avoid_: Block version, saved block

**Resume Section**:
The stable identity of a reusable ordered composition of Resume Blocks, independent of its use in any one Resume Draft.
_Avoid_: Section instance, group

**Section Revision**:
An immutable, presentation-neutral composition that preserves a Resume Section's heading semantics, ordered Block Revision bindings, and section options.
_Avoid_: Section version, saved section

**Resume Placement**:
One occurrence of a Block or Section in a Resume Draft, referencing an exact reusable revision and its chosen presentation. Multiple placements may share a base revision while carrying independent local edits.
_Avoid_: Shared instance, linked copy

**Composition Override**:
A draft-local variation of a placed Block or Section that preserves its base revision without changing the reusable composition. The Owner may promote it as a new revision or fork it into a separate reusable identity.
_Avoid_: Modified library block, shared edit

**Job Target**:
The stable record for one employment opening toward which resumes are tailored. It identifies the current Job Posting Snapshot for new work while retaining earlier snapshots.
_Avoid_: Role, job, opening

**Job Posting Snapshot**:
An immutable capture of the job description and associated posting details for a Job Target. Resume Checkpoints preserve the exact snapshot they used.
_Avoid_: Job snapshot, description

**Requirement Map**:
The stable analysis of one Job Posting Snapshot into requirements, priorities, terminology, confidence, and supporting passages.
_Avoid_: Job analysis, requirements list

**Requirement Map Revision**:
An immutable AI-generated or Owner-edited version of a Requirement Map. Resume Checkpoints preserve the exact revision used during tailoring.
_Avoid_: Requirement version, analysis result

**Resume Draft**:
The mutable working composition associated with a Job Target.
_Avoid_: Working document, resume workspace

**Resume Checkpoint**:
An immutable capture of a Resume Draft that preserves the exact evidence revisions, job posting snapshot, content, and presentation choices used at that moment.
_Avoid_: Version, saved resume

**Template**:
The stable identity of a reusable presentation design for a document, section, or block.
_Avoid_: Layout, theme

**Template Revision**:
An immutable version of a Template whose lifecycle is Draft, Validated, Approved, or Retired. Retired revisions remain available to historical checkpoints but not to new drafts.
_Avoid_: Template version, generated template

**Template Manifest**:
The typed, validated contract of one Template Revision, including its level, compatible content and children, style contract, tokens, assets, slots, and validation metadata.
_Avoid_: Template configuration, template metadata

**Render Artifact**:
A content-addressed PDF, LaTeX source, extracted text, or validation report produced from exact document, template, renderer, asset, and compiler inputs.
_Avoid_: Preview file, output file

**AI Proposal**:
An AI-generated candidate change tied to exact input and target revisions, with an independent Pending, Accepted, or Rejected review state. It gains authority only through Owner acceptance and cannot be accepted after relevant dependencies change without review of an updated proposal.
_Avoid_: AI edit, automatic change

**Operation**:
The application-owned record of a multi-step background task, including its status, current stage, attempts, result, and failure information. It ends as Succeeded, Failed, or Cancelled without waiting for review of any resulting AI Proposal.
_Avoid_: Workflow, job
