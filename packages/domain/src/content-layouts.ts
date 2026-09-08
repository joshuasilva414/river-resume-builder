const entryHeading = (left: string, dates = "{{startDate}} {{endDate}}") =>
  String.raw`\begin{minipage}[t]{0.68\linewidth}\raggedright ${left}\end{minipage}\hfill\begin{minipage}[t]{0.30\linewidth}\raggedleft ${dates}\end{minipage}\par\nopagebreak`;

/** Versioned fragment sources. Each field remains a single, explicit slot. */
export function builtInLayoutSource(id: string, style: "classic" | "compact") {
  const compact = style === "compact";
  switch (id) {
    case "contact-section":
      return String.raw`{\LARGE\bfseries {{name}} }\par
{{email}} {{phone}} {{location}} {{links}}\par`;
    case "contact-link":
      return String.raw`\href{{{url}}}{ {{label}} }`;
    case "summary-section":
      return String.raw`\section*{ {{heading}} }
\raggedright
{{summary}}\par`;
    case "skills-section":
      return String.raw`\section*{ {{heading}} }
\raggedright
{{skills}}\par`;
    case "experience-entry":
      return compact
        ? String.raw`${entryHeading(String.raw`\textbf{{{employer}}} {{title}}`)}
{{location}} {{accomplishments}}`
        : String.raw`${entryHeading(String.raw`\textbf{{{employer}}}`)}
\textit{{{title}}}\hfill {{location}}\par\nopagebreak
{{accomplishments}}`;
    case "project-entry":
      return String.raw`${entryHeading(String.raw`\textbf{{{project}}}`)}
${compact ? "{{description}} {{url}}" : "{{description}}\\par\\nopagebreak\n{{url}}"}\par\nopagebreak
{{accomplishments}}`;
    case "education-entry":
      return compact
        ? String.raw`${entryHeading(String.raw`\textbf{{{institution}}} {{degree}}`)}
{{fieldOfStudy}} {{gpa}} {{details}}`
        : String.raw`${entryHeading(String.raw`\textbf{{{institution}}}`)}
{{degree}} {{fieldOfStudy}}\hfill {{gpa}}\par\nopagebreak
{{details}}`;
    case "credential-entry":
      return compact
        ? String.raw`${entryHeading(String.raw`\textbf{{{credential}}} {{issuer}}`, "{{issuedDate}} {{expirationDate}}")}
{{url}} {{details}}`
        : String.raw`${entryHeading(String.raw`\textbf{{{credential}}}`, "{{issuedDate}} {{expirationDate}}")}
{{issuer}} {{url}}\par\nopagebreak
{{details}}`;
    default:
      if (
        [
          "experience-section",
          "project-section",
          "education-section",
          "credential-section",
        ].includes(id)
      )
        return String.raw`\section*{ {{heading}} }
\raggedright
{{entries}}`;
      throw new Error("Unknown built-in content layout.");
  }
}

/** Accept common web addresses without making non-web schemes executable. */
export function contentLinkHref(value: string) {
  const text = value.trim();
  if (/\s/.test(text)) return undefined;
  const address = /^(https?:\/\/|mailto:|tel:)/i.test(text)
    ? text
    : /^(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[/?#]|$)/i.test(text)
      ? `https://${text}`
      : undefined;
  if (!address) return undefined;
  try {
    return new URL(address).href;
  } catch {
    return undefined;
  }
}

export function isCurrentBuiltInLayout(layout: {
  id: string;
  revision: number;
  schema: { id: string; revision: number };
  source: string;
}) {
  if (layout.revision !== 2 || layout.schema.revision !== 2) return false;
  const style =
    layout.id === `${layout.schema.id}-classic`
      ? "classic"
      : layout.id === `${layout.schema.id}-compact`
        ? "compact"
        : null;
  if (!style) return false;
  try {
    return layout.source === builtInLayoutSource(layout.schema.id, style);
  } catch {
    return false;
  }
}
