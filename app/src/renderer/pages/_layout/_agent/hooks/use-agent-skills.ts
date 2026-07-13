import type { DiscoveredSkill } from "@shared/skills-ipc";
import { useCallback, useEffect, useState } from "react";

export function useAgentSkills() {
  const [skills, setSkills] = useState<DiscoveredSkill[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const nextSkills = await window.traceability.invoke("listSkills");
      setSkills(nextSkills);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setEnabled = useCallback(async (skillId: string, enabled: boolean) => {
    await window.traceability.invoke("setSkillEnabled", skillId, enabled);
    setSkills((current) =>
      current.map((skill) => (skill.id === skillId ? { ...skill, enabled } : skill)),
    );
  }, []);

  return { error, refresh, setEnabled, skills };
}
