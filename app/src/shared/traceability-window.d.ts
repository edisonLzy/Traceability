import type {
  AllowedMainExposeEvents,
  AllowedRenderInvokeEvents,
  TraceabilityInvokeIPC,
} from "./events-ipc.js";

type InvokeArgs<C extends keyof TraceabilityInvokeIPC> = Parameters<TraceabilityInvokeIPC[C]>;

declare global {
  interface Window {
    traceability: {
      platform: string;
      invoke: <C extends AllowedRenderInvokeEvents>(
        channel: C,
        ...args: InvokeArgs<C>
      ) => Promise<Awaited<ReturnType<TraceabilityInvokeIPC[C]>>>;
      on: <E extends keyof AllowedMainExposeEvents>(
        event: E,
        callback: (payload: AllowedMainExposeEvents[E]) => void,
      ) => () => void;
    };
  }
}

export {};
