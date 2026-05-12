export type SkillName =
  | 'init' | 'explore' | 'decide' | 'map' | 'finalize' | 'free'
  | 'new' | 'triage' | 'audit' | 'status';

const NO_SLUG_SKILLS: ReadonlySet<SkillName> = new Set<SkillName>(['new', 'audit', 'status']);

export function composeCommand(p: {
  skill: SkillName;
  nodes?: string[];
  prompt?: string;
}): string[] {
  const base = ['claude', '--model', 'opus'];

  if (p.skill === 'free') {
    return base;
  }

  if (p.skill === 'init') {
    const cmd = p.prompt ? `/architector:new ${p.prompt}` : '/architector:new';
    return [...base, cmd];
  }

  if (p.skill === 'explore' || p.skill === 'decide') {
    const slug = p.nodes && p.nodes.length > 0 ? ` ${p.nodes[0]}` : '';
    return [...base, `/architector:${p.skill}${slug}`];
  }

  if (NO_SLUG_SKILLS.has(p.skill)) {
    return [...base, `/architector:${p.skill}`];
  }

  if (p.skill === 'triage') {
    const slugs = p.nodes && p.nodes.length > 0 ? ` ${p.nodes.join(' ')}` : '';
    return [...base, `/architector:triage${slugs}`];
  }

  // map | finalize
  const slugs = p.nodes && p.nodes.length > 0 ? ` ${p.nodes.join(' ')}` : '';
  return [...base, `/architector:${p.skill}${slugs}`];
}

import { CONSULTATION_SYSTEM_PROMPT } from '@shared/consultation/systemPrompt';

export function composeConsultationCommand(projectRoot: string): string[] {
  return [
    'claude',
    '--model', 'opus',
    '--permission-mode', 'dontAsk',
    '--system-prompt', CONSULTATION_SYSTEM_PROMPT,
    '--add-dir', projectRoot,
    '--allowedTools', 'Read', 'Grep', 'Glob',
  ];
}
