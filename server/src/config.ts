export interface ServerConfig {
  port: number;
  dbPath: string;
}

export function getConfig(): ServerConfig {
  return {
    port: Number(process.env.PORT ?? 3000),
    dbPath: process.env.TRACEABILITY_DB_PATH ?? "server/data/traceability.db",
  };
}
