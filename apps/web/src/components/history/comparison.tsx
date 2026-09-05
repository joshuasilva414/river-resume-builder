import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { EvidenceDialog } from "~/components/evidence/shared";
import { Button } from "~/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { HistoryContent } from "./content";
import { HistoryPdf } from "./pdf";
import { RestoreCheckpoint } from "./restore";
import { HistorySelectionPanel, type HistorySnapshot } from "./selection";

export function CheckpointComparison({
  draftId,
  checkpointId,
  onClose,
}: {
  draftId: string;
  checkpointId: string;
  onClose: () => void;
}) {
  const [before, setBefore] = useState<HistorySnapshot | null>(null),
    [after, setAfter] = useState<HistorySnapshot | null>(null),
    [restore, setRestore] = useState<string | null>(null);
  return (
    <EvidenceDialog
      title="Compare saved versions"
      description="Load two exact inputs. Later saves and document results do not replace this comparison."
      onClose={onClose}
      wide
      className="sm:max-w-[1400px] sm:w-[95vw]"
    >
      <div className="space-y-5">
        <div className="grid min-w-0 gap-5 md:grid-cols-2">
          <HistorySelectionPanel
            label="Base"
            draftId={draftId}
            initialCheckpointId={checkpointId}
            pinned={before}
            onPin={setBefore}
          />
          <HistorySelectionPanel
            label="Compare"
            draftId={draftId}
            pinned={after}
            onPin={setAfter}
          />
        </div>
        {before && after ? (
          <>
            {before.content.posting.id !== after.content.posting.id && (
              <p className="border-l-2 border-warning bg-warning/10 p-4 text-sm">
                These versions use different posting snapshots. Complete posting changes are
                included. Score deltas require the same snapshot and compatible scoring identities.
              </p>
            )}
            <Tabs defaultValue="content">
              <TabsList>
                <TabsTrigger value="content">Content</TabsTrigger>
                <TabsTrigger value="pdf">PDF</TabsTrigger>
                <TabsTrigger
                  value="scores"
                  disabled={before.selection.kind === "draft" || after.selection.kind === "draft"}
                >
                  Scores
                </TabsTrigger>
              </TabsList>
              <TabsContent value="content">
                <HistoryContent before={before} after={after} />
              </TabsContent>
              <TabsContent value="pdf" forceMount className="data-[state=inactive]:hidden">
                <HistoryPdf before={before} after={after} />
              </TabsContent>
              <TabsContent value="scores">
                <p className="text-sm">
                  Open each saved checkpoint's Scores review to choose its exact completed scoring
                  run. A saved version alone does not identify a scoring result.
                </p>
                <div className="mt-3 flex flex-wrap gap-4">
                  {(
                    [
                      ["Base", before],
                      ["Compare", after],
                    ] as const
                  ).map(
                    ([label, value]) =>
                      value.selection.kind === "checkpoint" && (
                        <Link
                          key={label}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-h-11 items-center text-primary underline text-sm"
                          to="/checkpoints/$checkpointId"
                          params={{ checkpointId: value.selection.id }}
                          search={{ scores: true }}
                        >
                          {label} scoring review
                        </Link>
                      ),
                  )}
                </div>
              </TabsContent>
            </Tabs>
            {(before.selection.kind === "draft" || after.selection.kind === "draft") && (
              <p className="text-sm text-muted-foreground">
                A working draft has no scoring result. Save and score a checkpoint before comparing
                scores.
              </p>
            )}
            {before.selection.kind === "checkpoint" && (
              <Button variant="outline" onClick={() => setRestore(before.selection.id)}>
                Restore base as a branch
              </Button>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Load the base and compare versions to inspect complete wording, composition, evidence
            and PDFs.
          </p>
        )}
      </div>
      {restore && <RestoreCheckpoint checkpointId={restore} onClose={() => setRestore(null)} />}
    </EvidenceDialog>
  );
}
