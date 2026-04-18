export type SkillName = 'init' | 'explore' | 'decide' | 'map' | 'finalize' | 'free';

export function composeCommand(p: {
  skill: SkillName;
  nodes?: string[];
  prompt?: string;
  skillsDir: string;
}): string[] {
  const dir = p.skillsDir.replace(/\/$/, '');

  if (p.skill === 'free') {
    return ['claude'];
  }

  if (p.skill === 'init') {
    const cmd = p.prompt ? `/architector:init ${p.prompt}` : '/architector:init';
    return ['claude', cmd, '--append-system-prompt-file', `${dir}/init.md`];
  }

  if (p.skill === 'explore' || p.skill === 'decide') {
    const slug = p.nodes && p.nodes.length > 0 ? ` ${p.nodes[0]}` : '';
    const cmd = `/architector:${p.skill}${slug}`;
    return ['claude', cmd, '--append-system-prompt-file', `${dir}/${p.skill}.md`];
  }

  // map | finalize
  const slugs = p.nodes && p.nodes.length > 0 ? ` ${p.nodes.join(' ')}` : '';
  const cmd = `/architector:${p.skill}${slugs}`;
  return ['claude', cmd, '--append-system-prompt-file', `${dir}/${p.skill}.md`];
}
