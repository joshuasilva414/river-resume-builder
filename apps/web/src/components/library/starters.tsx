import { blockDefinitions, type ContentType, contentTypes } from "@river/domain";
import { useState } from "react";
import { Button } from "../ui/button";
import { StructuredLibraryEditor } from "./structured-editor";

export function LibraryStarters({ onSaved }: { onSaved: (id: string) => void }) {
  const [type, setType] = useState<ContentType | null>(null);
  return (
    <section className="space-y-4 border-b px-5 py-6 md:px-8" aria-label="Resume starters">
      <div>
        <h2 className="text-lg font-semibold">Start with the essentials</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose a ready-made structure and add your own details. Save it once to reuse across
          résumés.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {contentTypes.map((item) => (
          <Button
            key={item}
            variant="outline"
            className="h-auto min-h-14 justify-start whitespace-normal py-3 text-left"
            onClick={() => setType(item)}
          >
            {blockDefinitions[item].label}
          </Button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        For custom fields, open a section and choose fields from one of your saved templates.
      </p>
      {type && (
        <StructuredLibraryEditor
          key={type}
          kind="section"
          type={type}
          onClose={() => setType(null)}
          onSaved={(reference) => onSaved(reference.itemId)}
        />
      )}
    </section>
  );
}
