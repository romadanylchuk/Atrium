import { useState, type JSX } from 'react';
import type { InitFormFields } from './buildInitPrompt';

type Props = {
  initialPath?: string;
  onSubmit: (fields: InitFormFields & { cwd: string }) => void;
};

export function NewProjectForm({ initialPath = '', onSubmit }: Props): JSX.Element {
  const [name, setName] = useState('');
  const [technology, setTechnology] = useState('');
  const [description, setDescription] = useState('');
  const [targetAudience, setTargetAudience] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ name, technology, description, targetAudience, cwd: initialPath });
  };

  return (
    <form onSubmit={handleSubmit}>
      <p>New project at: {initialPath}</p>
      <label>
        Name
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Project"
        />
      </label>
      <label>
        Technology
        <input
          type="text"
          value={technology}
          onChange={(e) => setTechnology(e.target.value)}
          placeholder="React, TypeScript, ..."
        />
      </label>
      <label>
        Description
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What does this project do?"
        />
      </label>
      <label>
        Target Audience
        <input
          type="text"
          value={targetAudience}
          onChange={(e) => setTargetAudience(e.target.value)}
          placeholder="Developers, end users, ..."
        />
      </label>
      <button type="submit">Initialize Project</button>
    </form>
  );
}
