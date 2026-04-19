import React from 'react';
import { useAtriumStore } from '../store/atriumStore';

const containerStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#1e1e1e',
  color: '#d4d4d4',
  gap: '16px',
  zIndex: 10,
};

const buttonStyle: React.CSSProperties = {
  padding: '8px 16px',
  background: '#3a3a3a',
  color: '#d4d4d4',
  border: '1px solid #555',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '13px',
};

export function CanvasErrorState({ message }: { message: string }) {
  function handleClear() {
    useAtriumStore.getState().clearProject();
  }

  return (
    <div style={containerStyle}>
      <div>{message}</div>
      <button style={buttonStyle} onClick={handleClear}>
        Clear and start fresh
      </button>
    </div>
  );
}
