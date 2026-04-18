/**
 * parser/index.ts — barrel export for the pure parser layer.
 *
 * All exports are Electron-free and fs-free. They consume strings/maps
 * and return typed results. I/O is handled by higher layers (storage/project).
 */

export { splitByH2, firstParagraph } from './splitHeadings';
export { parseIndex } from './parseIndex';
export type { ParsedIndex, IndexNode } from './parseIndex';
export { parseNodeMarkdown } from './parseNodeMarkdown';
export type { ParsedNodeMD } from './parseNodeMarkdown';
export { parseProjectContext } from './parseProjectContext';
export { assembleProjectState } from './assembleProjectState';
export type { AssembleInput } from './assembleProjectState';
