import type { PostgresDatabase } from "../../db/postgres.js";
import { processEventItem } from "./event-handler.js";

export type ItemProcessor = (database: PostgresDatabase, itemId: string) => Promise<void>;

/**
 * The public envelope endpoint never needs to know which item types exist.
 * New Envelope support is introduced by adding a processor here and a queue
 * policy, without changing protocol parsing or durable ingestion.
 */
export const itemProcessors: Readonly<Record<string, ItemProcessor>> = {
  "ingest.event": processEventItem,
};
