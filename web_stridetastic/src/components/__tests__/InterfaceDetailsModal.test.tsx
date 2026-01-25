import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import InterfaceDetailsModal from '@/components/InterfaceDetailsModal';

const startMock = vi.fn();
const stopMock = vi.fn();
const restartMock = vi.fn();

vi.mock('@/lib/api', () => ({
  apiClient: {
    startInterface: (...args: any[]) => startMock(...args),
    stopInterface: (...args: any[]) => stopMock(...args),
    restartInterface: (...args: any[]) => restartMock(...args),
  },
}));

describe('InterfaceDetailsModal', () => {
  beforeEach(() => {
    startMock.mockReset();
    stopMock.mockReset();
    restartMock.mockReset();
  });

  it('calls start for stopped interface', async () => {
    startMock.mockResolvedValueOnce({});

    render(
      <InterfaceDetailsModal
        iface={{ id: 1, interface_type: 'MQTT', name: 'MQTT', status: 'STOPPED', is_enabled: true }}
        isOpen
        onClose={() => {}}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /^start$/i }));

    await waitFor(() => {
      expect(startMock).toHaveBeenCalledWith(1);
    });
  });

  it('calls stop for running interface', async () => {
    stopMock.mockResolvedValueOnce({});

    render(
      <InterfaceDetailsModal
        iface={{ id: 2, interface_type: 'MQTT', name: 'MQTT', status: 'RUNNING', is_enabled: true }}
        isOpen
        onClose={() => {}}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /stop/i }));

    await waitFor(() => {
      expect(stopMock).toHaveBeenCalledWith(2);
    });
  });

  it('calls restart for enabled interface', async () => {
    restartMock.mockResolvedValueOnce({});

    render(
      <InterfaceDetailsModal
        iface={{ id: 3, interface_type: 'MQTT', name: 'MQTT', status: 'RUNNING', is_enabled: true }}
        isOpen
        onClose={() => {}}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /restart/i }));

    await waitFor(() => {
      expect(restartMock).toHaveBeenCalledWith(3);
    });
  });
});
