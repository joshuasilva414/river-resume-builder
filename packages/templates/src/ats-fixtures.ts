import { canonicalJson, fingerprint, ResumeDocument } from "@river/domain";
import { Schema } from "effect";

export const ATS_FIXTURE_SET_VERSION = "river-ats-fixtures-v1";

/** Fictional candidates and jobs for template qualification. Never resolve Owner evidence here. */
export const atsFixtures = [
  {
    id: "graduate-web",
    name: "Graduate web engineer · all content types",
    jobDescription:
      "Synthetic vacancy: Graduate Software Engineer at Example Web Systems. Build accessible React and TypeScript interfaces, Node.js REST APIs and PostgreSQL features. Write unit and integration tests, review pull requests and maintain GitHub Actions CI. Required: a bachelor's degree in Computer Science, knowledge of HTML, CSS, JavaScript, SQL, Git, data structures and algorithms. Internship or substantial project experience is acceptable. Preferred: automated accessibility checks, Docker and AWS Cloud Practitioner certification. Collaborate with designers and explain technical decisions clearly.",
    document: {
      name: "Alex Morgan",
      contact: [
        "alex.morgan@example.test | 202-555-0101 | Austin, TX",
        "https://portfolio.example.test/alex",
      ],
      sections: [
        {
          type: "summary",
          heading: "Summary",
          blocks: [
            {
              type: "summary",
              heading: "",
              detail: "",
              paragraphs: [
                "Computer Science graduate with software engineering internship experience building accessible React and TypeScript applications, Node.js APIs and PostgreSQL features. Writes automated tests and documents technical decisions.",
              ],
              bullets: [],
            },
          ],
        },
        {
          type: "experience",
          heading: "Experience",
          blocks: [
            {
              type: "experience",
              heading: "Software Engineering Intern | Example Web Systems",
              detail: "Austin, TX | May 2025 - August 2025",
              paragraphs: [],
              bullets: [
                "Built 6 accessible React and TypeScript forms with keyboard navigation and field validation, reducing incomplete submissions by 25% in a usability study.",
                "Implemented 4 Node.js REST endpoints with PostgreSQL transactions and integration tests for customer intake.",
                "Added 38 unit tests and GitHub Actions checks, reducing repeated manual verification by 3 hours per release.",
              ],
            },
          ],
        },
        {
          type: "project",
          heading: "Projects",
          blocks: [
            {
              type: "project",
              heading: "Community Resource Directory",
              detail: "React, TypeScript, Node.js, PostgreSQL, Docker | January 2026 - May 2026",
              paragraphs: [
                "Built a searchable directory with an accessible responsive interface and documented REST API.",
              ],
              bullets: [
                "Indexed 1,200 synthetic resource records and reduced median search time from 420 ms to 110 ms.",
                "Implemented 24 integration tests for filtering, pagination and invalid requests; reviewed pull requests with a four-person team.",
              ],
            },
          ],
        },
        {
          type: "education",
          heading: "Education",
          blocks: [
            {
              type: "education",
              heading: "Bachelor of Science in Computer Science | Example State University",
              detail: "May 2026 | GPA: 3.7/4.0",
              paragraphs: [
                "Coursework: data structures, algorithms, databases, software engineering and human-computer interaction.",
              ],
              bullets: [],
            },
          ],
        },
        {
          type: "skill",
          heading: "Technical Skills",
          blocks: [
            {
              type: "skill",
              heading: "",
              detail: "",
              paragraphs: [
                "Languages: TypeScript, JavaScript, HTML, CSS, SQL",
                "Frameworks and tools: React, Node.js, PostgreSQL, Git, GitHub Actions, Docker, Vitest",
                "Practices: REST APIs, unit testing, integration testing, accessibility, code review",
              ],
              bullets: [],
            },
          ],
        },
        {
          type: "credential",
          heading: "Certifications",
          blocks: [
            {
              type: "credential",
              heading: "AWS Certified Cloud Practitioner",
              detail: "Amazon Web Services | June 2025",
              paragraphs: [],
              bullets: [],
            },
          ],
        },
      ],
    },
  },
  {
    id: "experienced-platform",
    name: "Experienced platform engineer · multiple roles and page flow",
    jobDescription:
      "Synthetic vacancy: Senior Platform Engineer at Example Infrastructure. Design reliable backend services and deployment platforms using Go, Python, PostgreSQL, Kubernetes, Terraform and AWS. Required: at least five years of software engineering experience, Linux administration, REST APIs, observability, incident response, automated tests and CI/CD. Improve service availability, latency and deployment safety. Mentor engineers, document architecture and work with product teams. Preferred: infrastructure as code, distributed job processing, database tuning and Kubernetes certification. A bachelor's degree in Computer Science or equivalent practical experience is acceptable.",
    document: {
      name: "Jordan Lee",
      contact: [
        "jordan.lee@example.test | 202-555-0102 | Chicago, IL",
        "https://portfolio.example.test/jordan",
      ],
      sections: [
        {
          type: "summary",
          heading: "Summary",
          blocks: [
            {
              type: "summary",
              heading: "",
              detail: "",
              paragraphs: [
                "Platform engineer with seven years of experience building Go and Python services, PostgreSQL data systems and Kubernetes delivery platforms on AWS. Leads reliability improvements, incident response and practical engineering mentorship.",
              ],
              bullets: [],
            },
          ],
        },
        {
          type: "experience",
          heading: "Experience",
          blocks: [
            {
              type: "experience",
              heading: "Senior Platform Engineer | Example Infrastructure",
              detail: "Chicago, IL | July 2023 - August 2026",
              paragraphs: [
                "Owned deployment tooling and reliability for a twelve-service platform supporting internal product teams.",
              ],
              bullets: [
                "Designed a Go job-processing service handling 2 million tasks daily with idempotent delivery and bounded retries.",
                "Reduced p95 API latency from 480 ms to 190 ms through PostgreSQL query plans, indexing and connection-pool tuning.",
                "Standardized Terraform modules for 8 AWS environments, reducing infrastructure setup from 2 days to 45 minutes.",
                "Implemented Kubernetes progressive delivery with health checks and rollback, reducing failed releases by 35%.",
                "Defined service-level objectives and OpenTelemetry dashboards, improving availability from 99.8% to 99.95%.",
                "Led 9 incident reviews and tracked corrective actions that reduced repeated alerts by 40%.",
                "Mentored 4 engineers through architecture reviews, pairing sessions and documented implementation plans.",
              ],
            },
            {
              type: "experience",
              heading: "Software Engineer | Example Data Services",
              detail: "Madison, WI | July 2019 - June 2023",
              paragraphs: [
                "Developed backend APIs and delivery automation for a data-processing product.",
              ],
              bullets: [
                "Built 12 Python REST endpoints with authentication, request validation and PostgreSQL persistence.",
                "Added 160 unit and integration tests for transaction rollback, concurrent updates and recovery after interrupted jobs.",
                "Migrated 6 Linux services to container deployments with automated CI/CD checks and staged releases.",
                "Reduced nightly data processing from 3 hours to 50 minutes by partitioning work and eliminating redundant queries.",
                "Introduced structured logs and service metrics that reduced median incident diagnosis time by 30%.",
                "Documented 15 API contracts and operational runbooks used by engineering and customer support.",
                "Collaborated with product teams to deliver 10 incremental releases while preserving backward-compatible API behavior.",
              ],
            },
          ],
        },
        {
          type: "project",
          heading: "Projects",
          blocks: [
            {
              type: "project",
              heading: "Service Recovery Lab",
              detail: "Go, Python, Kubernetes, Terraform, PostgreSQL | 2025",
              paragraphs: [
                "Created a repeatable environment for fault injection and recovery exercises using synthetic service data.",
              ],
              bullets: [
                "Automated 18 failure scenarios covering queue interruptions, database failover and deployment rollback.",
                "Verified recovery-point and recovery-time targets with restored database snapshots and artifact checks.",
              ],
            },
          ],
        },
        {
          type: "education",
          heading: "Education",
          blocks: [
            {
              type: "education",
              heading: "Bachelor of Science in Computer Science | Example Technical University",
              detail: "May 2019",
              paragraphs: [
                "Coursework: operating systems, distributed systems, databases and computer networks.",
              ],
              bullets: [],
            },
          ],
        },
        {
          type: "skill",
          heading: "Technical Skills",
          blocks: [
            {
              type: "skill",
              heading: "",
              detail: "",
              paragraphs: [
                "Languages: Go, Python, SQL, Bash",
                "Infrastructure: AWS, Kubernetes, Terraform, Docker, Linux, GitHub Actions",
                "Data and reliability: PostgreSQL, REST APIs, distributed queues, OpenTelemetry, incident response, CI/CD",
              ],
              bullets: [],
            },
          ],
        },
        {
          type: "credential",
          heading: "Certifications",
          blocks: [
            {
              type: "credential",
              heading: "Certified Kubernetes Administrator",
              detail: "Cloud Native Computing Foundation | April 2025",
              paragraphs: [],
              bullets: [],
            },
          ],
        },
      ],
    },
  },
  {
    id: "unicode-application",
    name: "Application engineer · Unicode and special characters",
    jobDescription:
      "Synthetic vacancy: Application Engineer at Example Café Systems. Develop C# and .NET REST APIs, SQL Server data access and React interfaces for retail operations. Required: two years of software development experience; C#, .NET, SQL, Git, automated testing and clear technical documentation. Build reliable integrations, measure performance and collaborate with users. Preferred: C++, TypeScript, Unicode-aware text processing, accessibility and experience with inventory or payment workflows. A bachelor's degree in Computer Science or Software Engineering is preferred.",
    document: {
      name: "Zoë Núñez",
      contact: [
        "zoe.nunez@example.test | 202-555-0103 | San José, CA",
        "https://portfolio.example.test/zoe",
      ],
      sections: [
        {
          type: "summary",
          heading: "Summary",
          blocks: [
            {
              type: "summary",
              heading: "",
              detail: "",
              paragraphs: [
                "Application engineer with three years of experience developing C#/.NET APIs, SQL Server data access and React interfaces. Builds tested integrations and Unicode-aware workflows for retail operations.",
              ],
              bullets: [],
            },
          ],
        },
        {
          type: "experience",
          heading: "Experience",
          blocks: [
            {
              type: "experience",
              heading: "Application Engineer | Example Café Systems",
              detail: "San José, CA | July 2023 - August 2026",
              paragraphs: [],
              bullets: [
                "Implemented 8 C#/.NET REST integrations for inventory & payment workflows, reducing reconciliation errors by 25%.",
                "Optimized SQL Server queries for 50,000 product records, reducing p95 response time from 600 ms to 180 ms.",
                "Added 72 automated tests for accented names, currency strings such as $500, and identifiers containing snake_case.",
                "Built accessible React forms and collaborated with 12 users to resolve keyboard-navigation and validation issues.",
              ],
            },
          ],
        },
        {
          type: "project",
          heading: "Projects",
          blocks: [
            {
              type: "project",
              heading: "Unicode Import Validator",
              detail: "C++, C#, TypeScript | 2025",
              paragraphs: [
                "Created a documented import tool that preserves names such as José and Zoë across UTF-8 and database boundaries.",
              ],
              bullets: [
                "Validated 10,000 synthetic records, preserving repeated text and literal characters including {value}, x_1 and 25%.",
                "Added 32 repeatable tests for field order, incomplete input and escaped output.",
              ],
            },
          ],
        },
        {
          type: "education",
          heading: "Education",
          blocks: [
            {
              type: "education",
              heading: "Bachelor of Science in Software Engineering | Example Pacific University",
              detail: "May 2023",
              paragraphs: [],
              bullets: [],
            },
          ],
        },
        {
          type: "skill",
          heading: "Technical Skills",
          blocks: [
            {
              type: "skill",
              heading: "",
              detail: "",
              paragraphs: [
                "Languages: C#, C++, TypeScript, SQL",
                "Frameworks and tools: .NET, React, SQL Server, Git, automated testing",
                "Practices: REST APIs, Unicode processing, accessibility, performance measurement, technical documentation",
              ],
              bullets: [],
            },
          ],
        },
      ],
    },
  },
] as const satisfies readonly {
  id: string;
  name: string;
  jobDescription: string;
  document: ResumeDocument;
}[];

/** Capture complete immutable inputs; later fixture edits require a new set identity and qualification. */
export async function captureAtsFixtureSet() {
  const fixtures = await Promise.all(
    atsFixtures.map(async (fixture) => {
      const document = Schema.decodeUnknownSync(ResumeDocument)(fixture.document);
      return {
        ...fixture,
        document,
        documentDigest: await fingerprint(canonicalJson(document)),
        jobDescriptionDigest: await fingerprint(fixture.jobDescription),
      };
    }),
  );
  const captured = { version: ATS_FIXTURE_SET_VERSION, fixtures };
  return { ...captured, digest: await fingerprint(canonicalJson(captured)) };
}
export type AtsFixtureSet = Awaited<ReturnType<typeof captureAtsFixtureSet>>;
