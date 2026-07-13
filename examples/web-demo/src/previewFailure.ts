/** Kept in its own module so production source-map resolution is easy to verify. */
export function throwPreviewSourceMapError(): never {
  const profile: { activeSession: { owner: { id: string } } } | undefined = undefined;
  return profile.activeSession.owner.id as never;
}
