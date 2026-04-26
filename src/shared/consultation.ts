/**
 * Shared types for the consultation chat feature.
 *
 * No Electron, Node, or React imports — safe for @shared.
 */

export type ConsultationRole = 'user' | 'assistant' | 'system';

export const CONSULTATION_MODELS = ['sonnet', 'opus'] as const;
export type ConsultationModel = (typeof CONSULTATION_MODELS)[number];

export interface ConsultationMessage {
  id: string;
  role: ConsultationRole;
  content: string;
  ts: number;
}

export interface ConsultationThread {
  sessionId: string;
  createdAt: number;
  lastActiveAt: number;
  model: ConsultationModel;
  systemPromptVersion: number;
  messages: ConsultationMessage[];
}

export interface ConsultationFile {
  schemaVersion: 1;
  activeThreadId: string;
  threads: Record<string, ConsultationThread>;
  orphanedThreads: Array<Omit<ConsultationThread, 'messages'>>;
}
