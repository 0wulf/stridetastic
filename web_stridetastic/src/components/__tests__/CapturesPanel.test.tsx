import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import CapturesPanel from '@/components/CapturesPanel';

const apiMocks = vi.hoisted(() => ({
  getCaptureSessions: vi.fn(),
  getInterfaces: vi.fn(),
  startCapture: vi.fn(),
  stopCapture: vi.fn(),
  cancelCapture: vi.fn(),
  deleteCapture: vi.fn(),
  deleteAllCaptures: vi.fn(),
  downloadCapture: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  apiClient: apiMocks,
}));

describe('CapturesPanel', () => {
  beforeEach(() => {
    Object.values(apiMocks).forEach((mock) => mock.mockReset());
  });

  it('loads sessions and interfaces', async () => {
    apiMocks.getCaptureSessions.mockResolvedValueOnce({ data: [] });
    apiMocks.getInterfaces.mockResolvedValueOnce({ data: [] });

    render(<CapturesPanel />);

    await waitFor(() => {
      expect(apiMocks.getCaptureSessions).toHaveBeenCalled();
      expect(apiMocks.getInterfaces).toHaveBeenCalled();
    });

    expect(screen.getByText(/new capture session/i)).toBeInTheDocument();
  });

  it('submits a new capture with trimmed name', async () => {
    apiMocks.getCaptureSessions.mockResolvedValue({ data: [] });
    apiMocks.getInterfaces.mockResolvedValue({ data: [{ id: 1, interface_type: 'MQTT', name: 'MQTT' }] });
    apiMocks.startCapture.mockResolvedValueOnce({ data: { session: { id: '1' } } });

    render(<CapturesPanel />);

    await waitFor(() => {
      expect(apiMocks.getCaptureSessions).toHaveBeenCalled();
    });

    const nameInput = screen.getByLabelText(/name/i);
    fireEvent.change(nameInput, { target: { value: '  test  ' } });

    const select = screen.getByLabelText(/interface/i);
    fireEvent.change(select, { target: { value: '1' } });

    fireEvent.submit(screen.getByRole('button', { name: /start capture/i }).closest('form')!);

    await waitFor(() => {
      expect(apiMocks.startCapture).toHaveBeenCalledWith({ name: 'test', interface_id: 1 });
    });
  });

  it('deletes all captures when confirmed', async () => {
    apiMocks.getCaptureSessions.mockResolvedValue({
      data: [
        {
          id: '1',
          name: 'cap',
          status: 'COMPLETED',
          filename: 'a',
          interface_name: 'Automatic',
          started_at: '2026-01-12T10:00:00.000Z',
          last_packet_at: '2026-01-12T10:05:00.000Z',
          packet_count: 3,
          file_size: 10,
        },
      ],
    });
    apiMocks.getInterfaces.mockResolvedValue({ data: [] });
    apiMocks.deleteAllCaptures.mockResolvedValueOnce({ data: { deleted: 1 } });

    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<CapturesPanel />);

    await waitFor(() => {
      expect(screen.getByText(/delete all/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /delete all/i }));

    await waitFor(() => {
      expect(apiMocks.deleteAllCaptures).toHaveBeenCalled();
    });
  });
});
