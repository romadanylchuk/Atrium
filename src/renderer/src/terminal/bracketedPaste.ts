export const PASTE_START = '\x1b[200~';
export const PASTE_END   = '\x1b[201~';

export function encodeBracketedPaste(text: string): string {
  const sanitized = text
    .split(PASTE_START).join('')
    .split(PASTE_END).join('')
    .split('\r\n').join('\n')
    .split('\r').join('\n');
  if (!sanitized) return '';
  return PASTE_START + sanitized + PASTE_END;
}
