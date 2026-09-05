import { useState } from "react";
import { EvidenceDialog } from "~/components/evidence/shared";
import { Button } from "~/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { HistoryContent } from "./content";
import { HistoryPdf } from "./pdf";
import { RestoreCheckpoint } from "./restore";
import { HistoryScores } from "./scores";
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
    [restore, setRestore] = useState<string | null>(null),
    [tab, setTab] = useState("content");
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
            onPin={(value) => {
              setBefore(value);
              if (tab === "scores" && value.selection.kind === "draft") setTab("content");
            }}
          />
          <HistorySelectionPanel
            label="Compare"
            draftId={draftId}
            pinned={after}
            onPin={(value) => {
              setAfter(value);
              if (tab === "scores" && value.selection.kind === "draft") setTab("content");
            }}
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
            <Tabs value={tab} onValueChange={setTab}>
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
              <TabsContent value="scores" forceMount className="data-[state=inactive]:hidden">
                {before.selection.kind === "checkpoint" &&
                  after.selection.kind === "checkpoint" && (
                    <HistoryScores
                      key={`${before.selection.id}:${after.selection.id}`}
                      beforeCheckpointId={before.selection.id}
                      afterCheckpointId={after.selection.id}
                    />
                  )}
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
