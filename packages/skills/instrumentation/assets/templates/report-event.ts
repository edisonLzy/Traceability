import { report, addBreadcrumb, captureException } from "@traceability/core";

// Template: instrument an async operation
export async function instrumentedOperation<T>(
  feature: string,
  action: string,
  fn: () => Promise<T>,
  context?: Record<string, unknown>,
): Promise<T> {
  addBreadcrumb({ category: feature, message: `${action} start`, data: context });
  try {
    const result = await fn();
    report({ type: `${feature}-${action}`, payload: { ...context }, tags: { feature } });
    return result;
  } catch (err) {
    report({
      type: `${feature}-${action}-failed`,
      payload: { ...context, error: String(err) },
      tags: { feature },
    });
    captureException(err);
    throw err;
  }
}
