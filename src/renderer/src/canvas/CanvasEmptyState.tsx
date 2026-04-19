import React from 'react';

const containerStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#1e1e1e',
  color: '#7a7a7a',
  fontSize: '15px',
  zIndex: 10,
};

export function CanvasEmptyState() {
  return <div style={containerStyle}>No project open</div>;
}
