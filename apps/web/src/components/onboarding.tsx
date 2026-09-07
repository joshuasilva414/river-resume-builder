import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { getOnboardingProgress, updateWorkspacePreferences } from "~/server/ai-settings-functions";
import { useAiSettings } from "./ai-selection";
import { Failure, unwrap } from "./evidence/shared";
import { Button } from "./ui/button";

export function GettingStarted() {
  const settings = useAiSettings(),
    client = useQueryClient();
  const progress = useQuery({
    queryKey: ["onboarding", settings.data?.ownerId],
    enabled: Boolean(settings.data && !settings.data.preferences.onboardingDismissed),
    queryFn: async () => unwrap(await getOnboardingProgress()),
    staleTime: 0,
  });
  const dismiss = useMutation({
    mutationFn: async () => {
      if (!settings.data) return;
      return unwrap(
        await updateWorkspacePreferences({
          data: {
            preferences: { ...settings.data.preferences, onboardingDismissed: true },
            revision: settings.data.revision,
            idempotencyKey: crypto.randomUUID(),
          },
        }),
      );
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["ai-settings"] }),
  });
  if (!settings.data || settings.data.preferences.onboardingDismissed || !progress.data)
    return null;
  const completed = Object.values(progress.data).filter(Boolean).length;
  const steps = [
    {
      key: "evidence",
      title: "Add your experience",
      to: "/sources",
      text: "Import a résumé or add notes. Review proposed facts before using them.",
    },
    {
      key: "job",
      title: "Choose a job",
      to: "/jobs",
      text: "Save a role and its job description.",
    },
    {
      key: "content",
      title: "Build your library",
      to: "/library",
      text: "Start with contact details, education, or an accomplishment.",
    },
    {
      key: "draft",
      title: "Build a résumé",
      to: "/jobs",
      text: "Open a job and create a draft with your saved content.",
    },
    {
      key: "review",
      title: "Review your résumé",
      to: "/jobs",
      text: "Save a checkpoint, check the PDF, and review its evidence.",
    },
    {
      key: "exported",
      title: "Download your PDF",
      to: "/jobs",
      text: "Resolve review items, then export the finished résumé.",
    },
  ] as const;
  return (
    <section
      className="space-y-5 border-b bg-accent/30 px-5 py-7 md:px-8"
      aria-label="Getting started"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Getting started · {completed} of 6 complete</p>
          <h2 className="mt-2 font-serif text-[28px]">Build your first tailored résumé</h2>
        </div>
        <Button variant="ghost" disabled={dismiss.isPending} onClick={() => dismiss.mutate()}>
          Skip for now
        </Button>
      </div>
      {!progress.data.evidence && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            to="/sources"
            className="rounded-lg border border-primary bg-background p-5 text-primary"
          >
            <strong>Import a résumé</strong>
            <span className="mt-2 block text-sm text-muted-foreground">
              Start from a PDF, Word document, or notes you already have.
            </span>
          </Link>
          <Link to="/evidence" className="rounded-lg border bg-background p-5">
            <strong>Start with your own notes</strong>
            <span className="mt-2 block text-sm text-muted-foreground">
              Add your experience manually. You can connect AI later.
            </span>
          </Link>
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {steps.map((step) => (
          <Link
            key={step.key}
            to={step.to}
            className="space-y-2 rounded-lg border bg-background p-4 hover:border-primary"
          >
            <p className="text-sm font-semibold">
              {progress.data[step.key] ? "✓ " : ""}
              {step.title}
            </p>
            <p className="text-sm text-muted-foreground">{step.text}</p>
          </Link>
        ))}
      </div>
      <p className="text-sm">
        AI is optional.{" "}
        <Link to="/settings" className="text-primary underline">
          Connect your provider
        </Link>{" "}
        for suggestions, or{" "}
        <Link to="/evidence" className="text-primary underline">
          add experience manually
        </Link>
        . You can reopen this checklist in Settings.
      </p>
      <Failure error={dismiss.error} />
    </section>
  );
}
