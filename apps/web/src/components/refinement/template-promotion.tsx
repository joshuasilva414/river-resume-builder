import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { EvidenceDialog, Failure, unwrap } from "~/components/evidence/shared";
import { TemplateAiBrief } from "~/components/templates/ai-brief";
import { Button } from "~/components/ui/button";
import { getTemplatePromotion } from "~/server/template-ai-functions";

export function TemplatePromotion({
  checkpointId,
  onClose,
}: {
  checkpointId: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["templates", "source-promotion", checkpointId],
    queryFn: async () => unwrap(await getTemplatePromotion({ data: { id: checkpointId } })),
  });
  if (!query.data?.configured)
    return (
      <EvidenceDialog
        title="Promote a layout idea"
        description="Inspect the accepted layout adjustment before creating a synthetic template proposal."
        onClose={onClose}
      >
        <Failure error={query.error} />
        {query.isPending ? (
          <p>Inspecting the accepted layout adjustment…</p>
        ) : query.data ? (
          <p>
            Template AI is unavailable. Your accepted checkpoint remains available for review and
            export.
          </p>
        ) : (
          <Button variant="outline" onClick={() => void query.refetch()}>
            Retry inspection
          </Button>
        )}
      </EvidenceDialog>
    );
  return (
    <TemplateAiBrief
      initialBase={query.data.base}
      promotion={query.data}
      onClose={onClose}
      onStarted={(id) => {
        onClose();
        void navigate({
          to: "/templates",
          search: {
            proposals: true,
            proposalId: id,
            revisionId: undefined,
            conversationId: undefined,
            designId: undefined,
          },
        });
      }}
    />
  );
}
