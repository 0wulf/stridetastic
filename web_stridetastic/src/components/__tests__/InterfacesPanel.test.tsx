import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import InterfacesPanel from '@/components/InterfacesPanel';

const getInterfacesMock = vi.fn();

vi.mock('@/lib/api', () => ({
  apiClient: {
    getInterfaces: (...args: any[]) => getInterfacesMock(...args),
  },
}));

describe('InterfacesPanel', () => {
  beforeEach(() => {
    getInterfacesMock.mockReset();
  });

  it('renders loading and then interface rows', async () => {
    getInterfacesMock.mockResolvedValueOnce({
      data: [
        {
          id: 1,
          interface_type: 'MQTT',
          name: 'MQTT Interface',
          status: 'RUNNING',
          mqtt_topic: 'test',
          last_connected: '2026-01-13T11:00:00.000Z',
          last_error: null,
        },
      ],
    });

    render(<InterfacesPanel />);

    expect(screen.getByText(/loading interfaces/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/mqtt interface/i)).toBeInTheDocument();
    });

    expect(screen.getByText('MQTT Interface')).toBeInTheDocument();
    expect(screen.getByText('MQTT')).toBeInTheDocument();
    expect(screen.getByText('RUNNING')).toBeInTheDocument();
  });
});
