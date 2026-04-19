import { useState, useEffect, type JSX } from 'react';
import type { HealthInfo, HealthErrorCode } from '@shared/index';
import type { Result } from '@shared/index';

type Props = {
  checkFn: () => Promise<Result<HealthInfo, HealthErrorCode>>;
};

type HealthState =
  | { status: 'loading' }
  | { status: 'ok'; info: HealthInfo }
  | { status: 'error'; message: string };

export function HealthSection({ checkFn }: Props): JSX.Element {
  const [health, setHealth] = useState<HealthState>({ status: 'loading' });

  const runCheck = () => {
    setHealth({ status: 'loading' });
    void checkFn().then((r) => {
      if (r.ok) {
        setHealth({ status: 'ok', info: r.data });
      } else {
        setHealth({ status: 'error', message: r.error.message });
      }
    });
  };

  useEffect(() => {
    runCheck();
  }, []); // mount-only: runCheck is stable within the component lifetime

  if (health.status === 'loading') {
    return <p>Checking Claude availability...</p>;
  }

  if (health.status === 'error') {
    return (
      <div role="alert">
        <p>Claude not found: {health.message}</p>
        <button type="button" onClick={runCheck}>
          Recheck
        </button>
      </div>
    );
  }

  return <p>Claude {health.info.version} found.</p>;
}
