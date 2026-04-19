export type InitFormFields = {
  name?: string;
  technology?: string;
  description?: string;
  targetAudience?: string;
};

export function buildInitPrompt(fields: InitFormFields): string | undefined {
  const parts: string[] = [];

  if (fields.name?.trim()) parts.push(`Project name: ${fields.name.trim()}.`);
  if (fields.technology?.trim()) parts.push(`Technology stack: ${fields.technology.trim()}.`);
  if (fields.description?.trim()) parts.push(`Description: ${fields.description.trim()}.`);
  if (fields.targetAudience?.trim()) parts.push(`Target audience: ${fields.targetAudience.trim()}.`);

  return parts.length > 0 ? parts.join(' ') : undefined;
}
