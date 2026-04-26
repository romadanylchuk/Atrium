import { useEffect } from 'react';
import { useAtriumStore } from '@renderer/store/atriumStore';

/**
 * Subscribes to consultation stream push events for whichever messageId is
 * currently in-flight, forwarding chunk/complete/error payloads to the store.
 *
 * Subscriptions are torn down whenever:
 *  - the in-flight messageId changes (cancel + new send, retry, or rotation), or
 *  - the project root becomes null, or
 *  - the hook unmounts.
 */
export function useConsultation(projectRoot: string | null): void {
  const messageId = useAtriumStore((s) => s.consultation.inFlight?.messageId ?? null);
  const handleChunk = useAtriumStore((s) => s.handleConsultationStreamChunk);
  const handleComplete = useAtriumStore((s) => s.handleConsultationStreamComplete);
  const handleError = useAtriumStore((s) => s.handleConsultationStreamError);

  useEffect(() => {
    if (projectRoot === null || messageId === null) return;

    const offChunk = window.atrium.consultation.onStreamChunk(messageId, (fullText) => {
      handleChunk(messageId, fullText);
    });
    const offComplete = window.atrium.consultation.onStreamComplete(messageId, (fullContent) => {
      handleComplete(messageId, fullContent);
    });
    const offError = window.atrium.consultation.onStreamError(messageId, (errInfo) => {
      handleError(messageId, errInfo);
    });

    return () => {
      offChunk();
      offComplete();
      offError();
    };
  }, [projectRoot, messageId, handleChunk, handleComplete, handleError]);
}
