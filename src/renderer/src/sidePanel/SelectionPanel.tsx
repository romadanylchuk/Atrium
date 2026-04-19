import type { JSX } from 'react';
import { useAtriumStore } from '@renderer/store/atriumStore';

export function SelectionPanel(): JSX.Element {
  const selectedNodes = useAtriumStore((s) => s.selectedNodes);
  const project = useAtriumStore((s) => s.project);
  const clearSelection = useAtriumStore((s) => s.clearSelection);

  const nodeNames = Array.from(selectedNodes).map((slug) => {
    const node = project?.nodes.find((n) => n.slug === slug);
    return node?.name ?? slug;
  });

  return (
    <div data-testid="selection-panel">
      <h2>Selection</h2>
      {nodeNames.length === 0 ? (
        <p>No nodes selected.</p>
      ) : (
        <ul>
          {nodeNames.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      )}
      <button type="button" onClick={clearSelection}>
        Clear
      </button>
    </div>
  );
}
