import type { AvailableModel } from "@shared/models-ipc";

interface ModalSelectorProps {
  disabled?: boolean;
  models: AvailableModel[];
  onChange: (model: AvailableModel | null) => void;
  value: AvailableModel | null;
}

/** Kept under divisor's historical filename; renders Traceability's compact selector. */
export function ModalSelector({ disabled = false, models, onChange, value }: ModalSelectorProps) {
  const selectedKey = value ? `${value.providerId}/${value.modelId}` : "";
  return (
    <select
      aria-label="Select model"
      className="h-7 max-w-[150px] rounded-md border border-hairline bg-surface-2 px-2 text-[10px] text-muted outline-none focus:border-primary disabled:opacity-50"
      disabled={disabled || models.length === 0}
      onChange={(event) => {
        const model = models.find(
          (candidate) => `${candidate.providerId}/${candidate.modelId}` === event.target.value,
        );
        onChange(model ?? null);
      }}
      value={selectedKey}
    >
      {models.length === 0 ? <option value="">No models</option> : null}
      {models.map((model) => (
        <option
          key={`${model.providerId}/${model.modelId}`}
          value={`${model.providerId}/${model.modelId}`}
        >
          {model.modelName}
        </option>
      ))}
    </select>
  );
}
