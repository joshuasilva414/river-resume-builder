import { AtsScoringResponse } from "@river/domain";
import { Schema } from "effect";
import { z } from "zod";

const reportSchema = z.object({
  results: z.array(
    z.object({
      name: z.string(),
      response: z
        .unknown()
        .transform((value) => Schema.decodeUnknownSync(AtsScoringResponse)(value)),
    }),
  ),
});
export function ScorecardResults({ result }: { result: string }) {
  let report: z.infer<typeof reportSchema>;
  try {
    report = reportSchema.parse(JSON.parse(result));
  } catch {
    return (
      <p className="text-sm text-muted-foreground">
        This result cannot be displayed with the current scorecard format.
      </p>
    );
  }
  return (
    <div className="space-y-5">
      {report.results.map((sample) => (
        <section key={sample.name} className="space-y-3">
          <h4 className="font-medium">{sample.name}</h4>
          <p className="text-xs text-muted-foreground">
            {sample.response._provider} ·{" "}
            {sample.response._scoringIdentity?.model.reported ??
              sample.response._scoringIdentity?.model.requested ??
              "Model not reported"}{" "}
            ·{" "}
            {sample.response._inputCoverage?.complete
              ? "Complete text coverage"
              : "Coverage metadata unavailable"}
          </p>
          {sample.response.results.map((score) => (
            <details key={score.system} className="rounded border p-3">
              <summary className="cursor-pointer text-sm">
                {score.system} · {score.overallScore}/100 ·{" "}
                {score.passesFilter ? "Passes simulated filter" : "Below simulated filter"}
              </summary>
              <div className="mt-3 space-y-3 text-xs leading-5">
                <p>
                  Formatting {score.breakdown.formatting.score} · Keywords{" "}
                  {score.breakdown.keywordMatch.score} · Sections {score.breakdown.sections.score} ·
                  Experience {score.breakdown.experience.score} · Education{" "}
                  {score.breakdown.education.score}
                </p>
                <p>
                  Missing keywords:{" "}
                  {score.breakdown.keywordMatch.missing.join(", ") || "None reported"}
                </p>
                {[...score.breakdown.formatting.issues, ...score.breakdown.education.notes].map(
                  (text) => (
                    <p key={text}>{text}</p>
                  ),
                )}
                {score.suggestions.map((suggestion, index) => (
                  <div
                    key={
                      typeof suggestion === "string" ? suggestion : `${suggestion.summary}:${index}`
                    }
                  >
                    <p>{typeof suggestion === "string" ? suggestion : suggestion.summary}</p>
                    {typeof suggestion !== "string" &&
                      suggestion.details.map((detail) => (
                        <p key={detail} className="text-muted-foreground">
                          {detail}
                        </p>
                      ))}
                  </div>
                ))}
              </div>
            </details>
          ))}
        </section>
      ))}
    </div>
  );
}
