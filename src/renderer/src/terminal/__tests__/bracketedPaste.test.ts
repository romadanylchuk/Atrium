import { describe, it, expect } from 'vitest';
import { encodeBracketedPaste, PASTE_START, PASTE_END } from '../bracketedPaste';

describe('encodeBracketedPaste', () => {
  it('empty string → empty string', () => {
    expect(encodeBracketedPaste('')).toBe('');
  });

  it('plain ASCII → enveloped', () => {
    expect(encodeBracketedPaste('abc')).toBe(`${PASTE_START}abc${PASTE_END}`);
  });

  it('CRLF → LF inside envelope', () => {
    expect(encodeBracketedPaste('a\r\nb')).toBe(`${PASTE_START}a\nb${PASTE_END}`);
  });

  it('lone CR → LF inside envelope', () => {
    expect(encodeBracketedPaste('a\rb')).toBe(`${PASTE_START}a\nb${PASTE_END}`);
  });

  it('mixed CRLF + LF → all LF inside envelope', () => {
    expect(encodeBracketedPaste('a\r\nb\nc')).toBe(`${PASTE_START}a\nb\nc${PASTE_END}`);
  });

  it('embedded PASTE_START is stripped', () => {
    expect(encodeBracketedPaste(`hello${PASTE_START}world`)).toBe(`${PASTE_START}helloworld${PASTE_END}`);
  });

  it('embedded PASTE_END is stripped', () => {
    expect(encodeBracketedPaste(`hello${PASTE_END}world`)).toBe(`${PASTE_START}helloworld${PASTE_END}`);
  });

  it('both sentinels interleaved are stripped', () => {
    expect(encodeBracketedPaste(`a${PASTE_START}b${PASTE_END}c`)).toBe(`${PASTE_START}abc${PASTE_END}`);
  });

  it('input that is exactly PASTE_START + PASTE_END → empty string', () => {
    expect(encodeBracketedPaste(`${PASTE_START}${PASTE_END}`)).toBe('');
  });

  it('whitespace-only is preserved and enveloped', () => {
    expect(encodeBracketedPaste('   ')).toBe(`${PASTE_START}   ${PASTE_END}`);
  });

  it('newline-only is preserved and enveloped', () => {
    expect(encodeBracketedPaste('\n')).toBe(`${PASTE_START}\n${PASTE_END}`);
  });

  it('unicode content is preserved unchanged', () => {
    expect(encodeBracketedPaste('em—dash ✓')).toBe(`${PASTE_START}em—dash ✓${PASTE_END}`);
  });
});
