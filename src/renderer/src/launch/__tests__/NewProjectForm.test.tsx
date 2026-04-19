import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { NewProjectForm } from '../NewProjectForm';

afterEach(cleanup);

describe('NewProjectForm', () => {
  it('allows empty submit (all fields optional)', async () => {
    const onSubmit = vi.fn();
    render(<NewProjectForm initialPath="/my/path" onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole('button', { name: /initialize project/i }));
    expect(onSubmit).toHaveBeenCalledWith({
      name: '',
      technology: '',
      description: '',
      targetAudience: '',
      cwd: '/my/path',
    });
  });

  it('propagates filled fields to onSubmit', async () => {
    const onSubmit = vi.fn();
    render(<NewProjectForm initialPath="/my/path" onSubmit={onSubmit} />);

    await userEvent.type(screen.getByPlaceholderText(/my project/i), 'Atrium');
    await userEvent.type(screen.getByPlaceholderText(/react, typescript/i), 'Electron');
    await userEvent.type(screen.getByPlaceholderText(/what does this project do/i), 'Canvas tool');
    await userEvent.type(screen.getByPlaceholderText(/developers, end users/i), 'Devs');

    await userEvent.click(screen.getByRole('button', { name: /initialize project/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Atrium',
      technology: 'Electron',
      description: 'Canvas tool',
      targetAudience: 'Devs',
      cwd: '/my/path',
    });
  });
});
