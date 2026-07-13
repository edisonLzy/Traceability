import { copyTextToClipboard } from "@renderer/lib/clipboard";
import axios from "axios";
import { toast } from "sonner";

const DEFAULT_SERVER_URL = "http://localhost:3000";

function getServerUrl(): string {
  const configuredUrl = import.meta.env?.VITE_SERVER_URL;
  if (typeof configuredUrl === "string" && configuredUrl.trim().length > 0) {
    return configuredUrl.replace(/\/$/, "");
  }
  return DEFAULT_SERVER_URL;
}

/** Backend server address — configurable via `VITE_SERVER_URL` at build time. */
export const SERVER_URL = getServerUrl();

/**
 * API 统一响应格式 — matches the server's envelope.
 *
 * Success:  `{ code: 0,   data: T,     timestamp }`
 * Business: `{ code: N,   message,     data: null, timestamp, traceId? }`
 * The error middleware serialises AppError / ZodError into this shape.
 */
interface ApiResponse<T = unknown> {
  code: number;
  message?: string;
  data: T;
  timestamp: string;
  traceId?: string;
}

/**
 * Shared axios instance for the renderer.
 *
 * The backend wraps every response in `{code, data, timestamp}`. This
 * interceptor checks the code: `code === 0` means success, in which case the
 * inner `data` is unwrapped so callers read it directly via `response.data`.
 * 204 responses carry no body and are left untouched.
 *
 * Business errors (code !== 0) and HTTP/network errors are surfaced as toasts
 * with a copy action so the user can report the failure.
 */
export const request = axios.create({ baseURL: SERVER_URL });

function copyMessage(message: string) {
  return () => {
    void copyTextToClipboard(message).catch(() => {
      toast.error("复制失败");
    });
  };
}

// ── Response Interceptor ────────────────────────────────────────────────────

request.interceptors.response.use(
  (response) => {
    const body = response.data as ApiResponse<unknown>;

    if (body.code === 0) {
      // Success: unwrap so callers read business data from response.data
      response.data = body.data;
      return response;
    }

    // Business error: the server returned a non-zero code with a message
    const message = body.message ?? `请求失败 (code: ${body.code})`;
    toast.error(message, {
      action: {
        label: "复制",
        onClick: copyMessage(message),
      },
    });
    return Promise.reject(new Error(message));
  },
  (error) => {
    // Network / HTTP error
    const payload = error.response?.data as ApiResponse<unknown> | undefined;
    const message = payload?.message ?? error.message ?? "网络请求失败，请检查连接";

    toast.error(message, {
      action: {
        label: "复制",
        onClick: copyMessage(message),
      },
    });
    return Promise.reject(error);
  },
);
