import type { JSX } from 'react';

export function App(): JSX.Element {
  return (
    <div
      style={{
        background: '#1e1e1e',
        color: '#e0e0e0',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        fontFamily: '-apple-system, Segoe UI, sans-serif',
      }}
    >
      <h1>Atrium</h1>
      <p>Stage 01 · scaffold verified</p>
    </div>
  );
}
