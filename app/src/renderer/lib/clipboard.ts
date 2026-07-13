export async function copyTextToClipboard(text: string): Promise<void> {
  const clipboard = (window as any).traceability?.clipboard;
  if (!clipboard) throw new Error("Clipboard IPC not available");
  await clipboard.writeText(text);
}
