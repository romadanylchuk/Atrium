import { useEffect, useMemo, useRef, useState } from 'react';
import { useReactFlow } from 'reactflow';
import { useAtriumStore } from '../store/atriumStore';
import { resolveMaturityStyle } from './visualEncoding';
import { searchNodes, type NodeMatch } from './nodeSearchMatch';

const FOCUS_ZOOM = 1.1;

function SearchIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="7" cy="7" r="4.5" />
      <line x1="10.5" y1="10.5" x2="14" y2="14" />
    </svg>
  );
}

function HighlightedName({ match }: { match: NodeMatch }) {
  if (!match.range) return <>{match.name}</>;
  const [start, end] = match.range;
  return (
    <>
      {match.name.slice(0, start)}
      <strong style={{ color: '#ffffff', fontWeight: 600 }}>{match.name.slice(start, end)}</strong>
      {match.name.slice(end)}
    </>
  );
}

export function NodeSearch({ onNavigate }: { onNavigate?: () => void } = {}) {
  const project = useAtriumStore((s) => s.project);
  const highlight = useAtriumStore((s) => s.legendHighlight);
  const setLegendHighlight = useAtriumStore((s) => s.setLegendHighlight);
  const rf = useReactFlow();

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // A legend click (or project switch) replaced our highlight: drop the stale node name.
  const searchActive = highlight?.kind === 'node';
  const wasActiveRef = useRef(false);
  useEffect(() => {
    if (wasActiveRef.current && !searchActive) setQuery('');
    wasActiveRef.current = searchActive;
  }, [searchActive]);

  const results = useMemo(
    () => (project ? searchNodes(project.nodes, query) : []),
    [project, query],
  );

  if (!project || project.nodes.length === 0) return null;

  function select(match: NodeMatch) {
    setQuery(match.name);
    setOpen(false);
    setLegendHighlight({ kind: 'node', value: match.slug });
    const node = rf.getNode(match.slug);
    if (node) {
      onNavigate?.();
      const w = node.width ?? 96;
      const h = node.height ?? 36;
      rf.setCenter(node.position.x + w / 2, node.position.y + h / 2, {
        zoom: Math.max(rf.getZoom(), FOCUS_ZOOM),
        duration: 300,
      });
    }
  }

  function clear() {
    setQuery('');
    setOpen(false);
    if (searchActive) setLegendHighlight(null);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => (results.length === 0 ? 0 : (i + 1) % results.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => (results.length === 0 ? 0 : (i - 1 + results.length) % results.length));
    } else if (e.key === 'Enter') {
      const match = results[activeIndex] ?? results[0];
      if (match) {
        e.preventDefault();
        select(match);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (open && query !== '') setOpen(false);
      else clear();
    }
  }

  const showList = open && query.trim() !== '';

  return (
    <div
      data-testid="node-search"
      className="nodrag nopan"
      style={{ position: 'absolute', top: 8, left: 42, width: 220, zIndex: 6 }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          height: 26,
          padding: '0 6px 0 8px',
          background: 'rgba(30,30,38,0.9)',
          border: `0.5px solid ${searchActive ? '#6a6a72' : '#3a3a42'}`,
          borderRadius: 4,
          color: '#8a8a92',
        }}
      >
        <SearchIcon />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label="Search nodes"
          aria-expanded={showList}
          aria-controls="node-search-list"
          aria-autocomplete="list"
          aria-activedescendant={showList && results[activeIndex] ? `node-search-opt-${activeIndex}` : undefined}
          placeholder="Find node…"
          value={query}
          spellCheck={false}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={handleKeyDown}
          style={{
            flex: 1,
            minWidth: 0,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#e6e6e6',
            fontSize: 11,
            fontFamily: 'inherit',
          }}
        />
        {query !== '' && (
          <button
            type="button"
            aria-label="Clear search"
            data-testid="node-search-clear"
            // mousedown + preventDefault keeps focus in the input
            onMouseDown={(e) => {
              e.preventDefault();
              clear();
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#8a8a92',
              cursor: 'pointer',
              padding: 0,
              fontSize: 14,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        )}
      </div>

      {showList && (
        <ul
          id="node-search-list"
          role="listbox"
          style={{
            listStyle: 'none',
            margin: '4px 0 0',
            padding: 4,
            background: 'rgba(20,20,25,0.97)',
            border: '0.5px solid #2a2a32',
            borderRadius: 6,
            maxHeight: 260,
            overflowY: 'auto',
          }}
        >
          {results.length === 0 ? (
            <li style={{ padding: '4px 6px', fontSize: 11, color: '#6a6a72' }}>No matching nodes</li>
          ) : (
            results.map((match, i) => {
              const { style } = resolveMaturityStyle(match.maturity);
              return (
                <li
                  key={match.slug}
                  id={`node-search-opt-${i}`}
                  role="option"
                  aria-selected={i === activeIndex}
                  data-testid={`node-search-option-${match.slug}`}
                  // mousedown fires before the input's blur closes the list
                  onMouseDown={(e) => {
                    e.preventDefault();
                    select(match);
                  }}
                  onMouseEnter={() => setActiveIndex(i)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 6px',
                    borderRadius: 3,
                    cursor: 'pointer',
                    background: i === activeIndex ? 'rgba(255,255,255,0.08)' : 'transparent',
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      flexShrink: 0,
                      borderRadius: 2,
                      background: style.fill,
                      border: `1px solid ${style.stroke}`,
                    }}
                  />
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: 11,
                      color: '#a0aec0',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    <HighlightedName match={match} />
                  </span>
                  <span style={{ fontSize: 9, color: style.subtitleColor }}>{match.maturity}</span>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
