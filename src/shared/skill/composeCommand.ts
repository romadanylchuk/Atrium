export type SkillName =
  | 'init' | 'explore' | 'decide' | 'map' | 'finalize' | 'free'
  | 'new' | 'triage' | 'audit' | 'status';

const NO_SLUG_SKILLS: ReadonlySet<SkillName> = new Set<SkillName>(['new', 'audit', 'status']);

export function composeCommand(p: {
  skill: SkillName;
  nodes?: string[];
  prompt?: string;
}): string[] {
  if (p.skill === 'free') {
    return ['claude'];
  }

  if (p.skill === 'init') {
    const cmd = p.prompt ? `/architector:init ${p.prompt}` : '/architector:init';
    return ['claude', cmd];
  }

  if (p.skill === 'explore' || p.skill === 'decide') {
    const slug = p.nodes && p.nodes.length > 0 ? ` ${p.nodes[0]}` : '';
    return ['claude', `/architector:${p.skill}${slug}`];
  }

  if (NO_SLUG_SKILLS.has(p.skill)) {
    return ['claude', `/architector:${p.skill}`];
  }

  if (p.skill === 'triage') {
    const slugs = p.nodes && p.nodes.length > 0 ? ` ${p.nodes.join(' ')}` : '';
    return ['claude', `/architector:triage${slugs}`];
  }

  // map | finalize
  const slugs = p.nodes && p.nodes.length > 0 ? ` ${p.nodes.join(' ')}` : '';
  return ['claude', `/architector:${p.skill}${slugs}`];
}
