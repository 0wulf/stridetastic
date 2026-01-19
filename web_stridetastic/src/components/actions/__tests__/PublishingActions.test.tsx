import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import PublishingActions from '@/components/actions/PublishingActions';

const apiMocks = vi.hoisted(() => ({
  getSelectablePublishNodes: vi.fn(),
  getNodes: vi.fn(),
  getChannelStatistics: vi.fn(),
  getInterfaces: vi.fn(),
  getPublisherReactiveStatus: vi.fn(),
  getPublisherPeriodicJobs: vi.fn(),
  getKeepaliveStatus: vi.fn(),
  getKeepaliveTransitions: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  apiClient: apiMocks,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => ({ get: vi.fn() }),
}));

describe('PublishingActions', () => {
  beforeEach(() => {
    Object.values(apiMocks).forEach((mock) => mock.mockReset());
  });

  it('renders publication actions after loading', async () => {
    apiMocks.getSelectablePublishNodes.mockResolvedValueOnce({ data: [] });
    apiMocks.getNodes.mockResolvedValueOnce({ data: [] });
    apiMocks.getChannelStatistics.mockResolvedValueOnce({ data: { channels: [] } });
    apiMocks.getInterfaces.mockResolvedValueOnce({ data: [] });
    apiMocks.getPublisherReactiveStatus.mockResolvedValueOnce({ data: { enabled: false } });
    apiMocks.getPublisherPeriodicJobs.mockResolvedValueOnce({ data: [] });

    render(<PublishingActions />);

    await waitFor(() => {
      expect(screen.getByText(/publication actions/i)).toBeInTheDocument();
    });
  });

  it('opens keepalive settings when selected', async () => {
    apiMocks.getSelectablePublishNodes.mockResolvedValueOnce({ data: [] });
    apiMocks.getNodes.mockResolvedValueOnce({ data: [] });
    apiMocks.getChannelStatistics.mockResolvedValueOnce({ data: { channels: [] } });
    apiMocks.getInterfaces.mockResolvedValueOnce({ data: [] });
    apiMocks.getPublisherReactiveStatus.mockResolvedValueOnce({ data: { enabled: false } });
    apiMocks.getPublisherPeriodicJobs.mockResolvedValueOnce({ data: [] });
    apiMocks.getKeepaliveStatus.mockResolvedValueOnce({
      data: {
        enabled: false,
        last_run_at: null,
        last_error_message: null,
        config: {
          enabled: false,
          payload_type: 'reachability',
          from_node: '',
          gateway_node: '',
          channel_name: '',
          channel_key: '',
          hop_limit: 3,
          hop_start: 3,
          interface_id: null,
          interface: null,
          offline_after_seconds: 3600,
          check_interval_seconds: 60,
          scope: 'all',
          selected_node_ids: [],
          selected_nodes: [],
        },
      },
    });
    apiMocks.getKeepaliveTransitions.mockResolvedValueOnce({ data: [] });

    render(<PublishingActions />);

    await waitFor(() => {
      expect(screen.getByText(/keepalive monitoring/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/keepalive monitoring/i));

    await waitFor(() => {
      expect(screen.getByText(/save settings/i)).toBeInTheDocument();
    });
  });
});
