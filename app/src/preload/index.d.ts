import type { AllowedMainExposeEvents, TraceabilityInvokeIPC } from "../shared/events-ipc.js";

type InvokeArgs<C extends keyof TraceabilityInvokeIPC> = Parameters<TraceabilityInvokeIPC[C]>;

interface ElectronAPI {
  platform: NodeJS.Platform;
  invoke<C extends keyof TraceabilityInvokeIPC>(
    channel: C,
    ...args: InvokeArgs<C>
  ): Promise<Awaited<ReturnType<TraceabilityInvokeIPC[C]>>>;
  on<E extends keyof AllowedMainExposeEvents>(
    event: E,
    callback: (data: AllowedMainExposeEvents[E]) => void,
  ): () => void;
}

declare global {
  interface Window {
    traceability: ElectronAPI;
  }
}
