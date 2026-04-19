export type SkillName = 'init' | 'explore' | 'decide' | 'map' | 'finalize' | 'free';

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

  // map | finalize
  const slugs = p.nodes && p.nodes.length > 0 ? ` ${p.nodes.join(' ')}` : '';
  return ['claude', `/architector:${p.skill}${slugs}`];
}
