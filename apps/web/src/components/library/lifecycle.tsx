import { EvidenceDialog } from "~/components/evidence/shared";
import { TrashAction } from "~/components/trash/actions";
import { Button } from "~/components/ui/button";
import { kindLabels, type LibraryDetail } from "./shared";

export function LibraryLifecycleDialog({
  item,
  onClose,
  onSaved,
}: {
  item: LibraryDetail["item"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const deleting = item.archivedAt === null;
  return (
    <EvidenceDialog
      title={`${deleting ? "Delete" : "Restore"} ${kindLabels[item.kind].toLowerCase()}`}
      description={
        deleting
          ? "Move this item to Trash. Saved résumés keep their content. You can restore it at any time."
          : "Return this item to your reusable content. Saved résumés are unchanged."
      }
      onClose={onClose}
    >
      <div className="space-y-5">
        <p className="font-semibold break-words">{item.label}</p>
        <div className="flex flex-wrap justify-end gap-3 border-t pt-5">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <TrashAction item={item} onChanged={onSaved} />
        </div>
      </div>
    </EvidenceDialog>
  );
}
