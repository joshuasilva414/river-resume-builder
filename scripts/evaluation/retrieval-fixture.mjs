// Fictional fixtures only. These never enter River's database or a production index.
export const queries = [
  {
    id: "web",
    text: "Build accessible React forms with keyboard navigation.",
    keywords: ["React", "accessible", "forms"],
    relevant: ["web-1", "web-2", "web-3"],
  },
  {
    id: "security",
    text: "Implement authentication and prevent unauthorized access between customer accounts.",
    keywords: ["authentication", "authorization", "accounts"],
    relevant: ["security-1", "security-2", "security-3"],
  },
  {
    id: "storage",
    text: "Optimize SQL database queries and improve data retrieval performance.",
    keywords: ["SQL", "database", "queries"],
    relevant: ["storage-1", "storage-2", "storage-3"],
  },
  {
    id: "delivery",
    text: "Automate software deployment, testing and release pipelines.",
    keywords: ["deployment", "testing", "pipelines"],
    relevant: ["delivery-1", "delivery-2", "delivery-3"],
  },
];
const relevant = [
  [
    "web-1",
    "Implemented accessible React forms with keyboard navigation and labeled validation errors.",
  ],
  ["web-2", "Tested React forms with screen readers and repaired inaccessible form controls."],
  [
    "web-3",
    "Enabled people using assistive technology to complete registration without a pointing device.",
  ],
  [
    "security-1",
    "Implemented authentication and authorization checks that isolate customer accounts.",
  ],
  [
    "security-2",
    "Added authentication tests proving one account cannot read another account’s documents.",
  ],
  [
    "security-3",
    "Prevented cross-tenant data access by verifying resource ownership at every endpoint.",
  ],
  ["storage-1", "Optimized SQL database queries with indexes and query-plan analysis."],
  ["storage-2", "Reduced database query latency by batching related SQL reads."],
  [
    "storage-3",
    "Replaced repeated table scans with indexed lookups to accelerate record retrieval.",
  ],
  ["delivery-1", "Built deployment pipelines with automated testing and rollback checks."],
  ["delivery-2", "Added integration testing to release pipelines before deployment."],
  [
    "delivery-3",
    "Shipped reproducible builds through continuous integration with automatic verification and recovery.",
  ],
];
export const claims = [
  ...relevant.map(([id, text], index) => ({
    id,
    text,
    owner: "owner-a",
    revision: 1,
    indexedRevision: 1,
    archived: false,
    updated: index,
  })),
  ...Array.from({ length: 136 }, (_, index) => ({
    id: `incidental-${index}`,
    text: `Fictional research note ${index}: attended a presentation mentioning ${queries[index % 4].keywords.join(", ")}. Took meeting notes; did not implement the demonstrated system.`,
    owner: "owner-a",
    revision: 1,
    indexedRevision: 1,
    archived: false,
    updated: 100 + index,
  })),
  {
    id: "foreign",
    text: relevant[0][1],
    owner: "owner-b",
    revision: 1,
    indexedRevision: 1,
    archived: false,
    updated: 999,
  },
  {
    id: "archived",
    text: relevant[3][1],
    owner: "owner-a",
    revision: 1,
    indexedRevision: 1,
    archived: true,
    updated: 999,
  },
  {
    id: "stale",
    text: relevant[6][1],
    owner: "owner-a",
    revision: 2,
    indexedRevision: 1,
    archived: false,
    updated: 999,
  },
];
export const embeddingInput = [
  ...claims.map((claim) => claim.text),
  ...queries.map((query) => query.text),
];
