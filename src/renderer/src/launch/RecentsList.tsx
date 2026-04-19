import type { JSX } from 'react';
import type { RecentProject } from '@shared/domain';

type Props = {
  recents: RecentProject[];
  onPick: (path: string) => void;
  currentPath?: string;
};

export function RecentsList({ recents, onPick, currentPath }: Props): JSX.Element {
  if (recents.length === 0) {
    return <p>No recent projects.</p>;
  }

  return (
    <ul>
      {recents.map((r) => (
        <li key={r.path}>
          <button
            type="button"
            disabled={r.path === currentPath}
            onClick={() => onPick(r.path)}
          >
            {r.name || r.path}
          </button>
        </li>
      ))}
    </ul>
  );
}
