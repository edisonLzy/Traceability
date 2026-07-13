import type { AvailableModel } from "@shared/models-ipc";

interface ModelSelectorProps {
  disabled?: boolean;
  models: AvailableModel[];
  onChange: (model: AvailableModel | null) => void;
  value: AvailableModel | null;
}

export function ModelSelector({ disabled = false, models, onChange, value }: ModelSelectorProps) {
  const selectedKey = value ? `${value.providerId}/${value.modelId}` : "";

  return (
    <select
      aria-label="Select model"
      disabled={disabled || models.length === 0}
      value={selectedKey}
      onChange={(event) => {
        const next = models.find(
          (model) => `${model.providerId}/${model.modelId}` === event.target.value,
        );
        onChange(next ?? null);
      }}
      className="h-7 max-w-[150px] rounded-md border border-hairline bg-surface-2 px-2 text-[10px] text-muted outline-none focus:border-primary disabled:opacity-50"
    >
      {models.length === 0 && <option value="">No models</option>}
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
