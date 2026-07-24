export interface ProjectPolicy {
  allowedOrigins: string[];
  rateLimitPerSecond: number;
  enabledItemTypes: string[];
  scrubRules: Record<string, unknown>;
  version: number;
}

export interface ProjectKeyView {
  id: string;
  publicKey: string;
  status: "active" | "disabled" | "revoked";
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}
