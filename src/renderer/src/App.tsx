import { useEffect, useRef, type JSX } from 'react';
import { registerRendererListeners } from '@renderer/ipc/registerListeners';
import { startAutoOpen } from '@renderer/autoOpen/startAutoOpen';
import { useAtriumStore } from '@renderer/store/atriumStore';
import { LaunchGate } from '@renderer/launch';
import { MainShell } from '@renderer/shell';
import { ToastContainer } from '@renderer/shell/ToastContainer';

export function App(): JSX.Element {
  const project = useAtriumStore((s) => s.project);
  const disposerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    disposerRef.current = registerRendererListeners();
    void startAutoOpen();
    return () => disposerRef.current?.();
  }, []);

  return (
    <>
      {project === null ? <LaunchGate /> : <MainShell />}
      <ToastContainer />
    </>
  );
}
