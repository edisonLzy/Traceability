import { Button } from "@renderer/components/ui/button";
import { Textarea } from "@renderer/components/ui/textarea";
import type { BrowserElementSummary } from "@shared/browser-types";

interface BrowserCommentComposerProps {
  element: BrowserElementSummary;
  value: string;
  onChange(value: string): void;
  onCancel(): void;
  onSubmit(): void;
}

export function BrowserCommentComposer({
  element,
  value,
  onChange,
  onCancel,
  onSubmit,
}: BrowserCommentComposerProps) {
  const label = element.name || element.text || element.selector || `<${element.tagName}>`;

  return (
    <section
      className="rounded-lg border border-primary/50 bg-surface-1 p-3 shadow-lg"
      aria-label="Add element comment"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 text-xs font-medium text-ink">Comment on element</p>
          <p className="m-0 truncate text-[11px] text-tertiary">{label}</p>
        </div>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={onCancel}
          aria-label="Close comment composer"
        >
          ×
        </Button>
      </div>
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="What should change?"
        rows={3}
        aria-label="Comment"
      />
      <div className="mt-2 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" disabled={!value.trim()} onClick={onSubmit}>
          Add comment
        </Button>
      </div>
    </section>
  );
}
