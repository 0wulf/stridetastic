import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import LoginForm from '../LoginForm';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

const loginMock = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ login: loginMock }),
}));

describe('LoginForm', () => {
  beforeEach(() => {
    pushMock.mockReset();
    loginMock.mockReset();
  });

  it('renders username/password inputs', () => {
    render(<LoginForm />);
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('navigates to /dashboard on successful login', async () => {
    loginMock.mockResolvedValue(true);

    render(<LoginForm />);

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'alice' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'secret' } });

    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(loginMock).toHaveBeenCalledWith('alice', 'secret');

    // allow the promise chain to resolve
    await screen.findByRole('button', { name: /sign in/i });

    expect(pushMock).toHaveBeenCalledWith('/dashboard');
  });

  it('shows an error on invalid credentials', async () => {
    loginMock.mockResolvedValue(false);

    render(<LoginForm />);

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'alice' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'bad' } });

    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/invalid credentials/i)).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
