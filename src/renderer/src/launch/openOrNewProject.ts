import type { ProjectState } from '@shared/domain';
import type { Result, ProjectErrorCode } from '@shared/index';

export type OpenOrNewResult =
  | { kind: 'opened'; state: ProjectState }
  | { kind: 'new'; cwd: string }
  | { kind: 'error'; message: string };

export async function openOrNewProject(
  path: string,
  openFn: (path: string) => Promise<Result<ProjectState, ProjectErrorCode>>,
): Promise<OpenOrNewResult> {
  let result: Result<ProjectState, ProjectErrorCode>;

  try {
    result = await openFn(path);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unexpected error opening project.';
    return { kind: 'error', message };
  }

  if (result.ok) {
    return { kind: 'opened', state: result.data };
  }

  if (result.error.code === 'NOT_AN_ARCH_PROJECT') {
    return { kind: 'new', cwd: path };
  }

  return { kind: 'error', message: result.error.message };
}
