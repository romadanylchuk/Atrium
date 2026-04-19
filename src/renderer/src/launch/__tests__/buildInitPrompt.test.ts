import { describe, it, expect } from 'vitest';
import { buildInitPrompt } from '../buildInitPrompt';

describe('buildInitPrompt', () => {
  it('returns undefined when all fields are blank', () => {
    expect(buildInitPrompt({})).toBeUndefined();
  });

  it('returns undefined when all fields are whitespace', () => {
    expect(buildInitPrompt({ name: '  ', technology: ' ', description: '', targetAudience: '' })).toBeUndefined();
  });

  it('returns a string containing only the provided field', () => {
    const result = buildInitPrompt({ name: 'Atrium' });
    expect(result).toContain('Atrium');
    expect(result).not.toContain('Technology');
    expect(result).not.toContain('Description');
  });

  it('contains all four fields when all are provided', () => {
    const result = buildInitPrompt({
      name: 'Atrium',
      technology: 'Electron',
      description: 'Canvas app',
      targetAudience: 'Developers',
    });
    expect(result).toContain('Atrium');
    expect(result).toContain('Electron');
    expect(result).toContain('Canvas app');
    expect(result).toContain('Developers');
  });

  it('fields appear in stable order: name, technology, description, targetAudience', () => {
    const result = buildInitPrompt({
      name: 'Alpha',
      technology: 'Beta',
      description: 'Gamma',
      targetAudience: 'Delta',
    })!;
    const posName = result.indexOf('Project name:');
    const posTech = result.indexOf('Technology stack:');
    const posDesc = result.indexOf('Description:');
    const posAudience = result.indexOf('Target audience:');
    expect(posName).toBeLessThan(posTech);
    expect(posTech).toBeLessThan(posDesc);
    expect(posDesc).toBeLessThan(posAudience);
  });

  it('trims whitespace from fields', () => {
    const result = buildInitPrompt({ name: '  Atrium  ' });
    expect(result).toContain('Atrium');
    expect(result).not.toContain('  Atrium  ');
  });
});
