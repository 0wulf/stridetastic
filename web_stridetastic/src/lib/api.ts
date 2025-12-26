import axios, { AxiosInstance, AxiosResponse } from 'axios';
import Cookies from 'js-cookie';
import { LoginCredentials, TokenResponse, Node, NodeKeyHealthEntry, Edge, ChannelStatistics, ChannelDetail, MessageResponse, PublishTextMessagePayload, PublishNodeInfoPayload, PublishPositionPayload, PublishTraceroutePayload, PublishReachabilityPayload, PublishTelemetryPayload, CaptureSession, PublisherReactiveStatus, PublisherReactiveConfigUpdatePayload, PublisherPeriodicJob, PublisherPeriodicJobCreatePayload, PublisherPeriodicJobUpdatePayload, NodePositionHistoryEntry, NodeTelemetryHistoryEntry, NodeLatencyHistoryEntry, PortActivityEntry, NodePortActivityEntry, NodePortPacketEntry, PortNodeActivityEntry, OverviewMetricsResponse, VirtualNodePayload, VirtualNodeSecretResponse, VirtualNodeUpdatePayload, VirtualNodeOptionsResponse, VirtualNodePrefillResponse, NodeLink, NodeLinkPacket } from '@/types';
import type { ActivityTimeRange } from '@/lib/activityFilters';
import type { Interface } from '@/types/interface';

const API_HOST_IP = process.env.NEXT_PUBLIC_API_HOST_IP || 'localhost';
const API_BASE_URL = `http://${API_HOST_IP}:8000/api`;

class ApiClient {
  async startInterface(interfaceId: number): Promise<AxiosResponse<{ message: string }>> {
    return this.client.post(`/interfaces/${interfaceId}/start`);
  }

  async stopInterface(interfaceId: number): Promise<AxiosResponse<{ message: string }>> {
    return this.client.post(`/interfaces/${interfaceId}/stop`);
  }

  async restartInterface(interfaceId: number): Promise<AxiosResponse<{ message: string }>> {
    return this.client.post(`/interfaces/${interfaceId}/restart`);
  }
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor to add auth token
    this.client.interceptors.request.use(
      (config: any) => {
        // Allow callers to opt-out of adding the Authorization header by
        // setting a private `_skipAuth` flag on the request config. This
        // flag is not sent over the wire and is useful for metadata endpoints
        // that should be reachable without triggering a CORS preflight.
        if (config && config._skipAuth) {
          return config;
        }
        const token = Cookies.get('access_token');
        if (token) {
          config.headers = config.headers || {};
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor to handle token refresh
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            const refreshToken = Cookies.get('refresh_token');
            if (refreshToken) {
              const response = await this.refreshToken(refreshToken);
              const { access, refresh } = response.data;
              
              Cookies.set('access_token', access, { expires: 1 });
              Cookies.set('refresh_token', refresh, { expires: 7 });
              
              originalRequest.headers.Authorization = `Bearer ${access}`;
              return this.client(originalRequest);
            }
          } catch (refreshError) {
            // Refresh failed, redirect to login
            Cookies.remove('access_token');
            Cookies.remove('refresh_token');
            window.location.href = '/login';
          }
        }

        return Promise.reject(error);
      }
    );
  }

  // Auth methods
  async login(credentials: LoginCredentials): Promise<AxiosResponse<TokenResponse>> {
    return this.client.post('/auth/login', credentials);
  }

  async refreshToken(refresh: string): Promise<AxiosResponse<TokenResponse>> {
    return this.client.post('/auth/refresh-token', { refresh });
  }

  logout(): void {
    Cookies.remove('access_token');
    Cookies.remove('refresh_token');
  }

  // API methods
  async getNodes(params?: { last?: ActivityTimeRange; since?: string; until?: string }): Promise<AxiosResponse<Node[]>> {
    return this.client.get('/nodes/', { params });
  }

  async getNodeKeyHealth(): Promise<AxiosResponse<NodeKeyHealthEntry[]>> {
    return this.client.get('/nodes/keys/health');
  }

  // Return nodes that are selectable for publishing actions. Backend may filter to virtual nodes
  async getSelectablePublishNodes(): Promise<AxiosResponse<Node[]>> {
    return this.client.get('/publisher/nodes/selectable');
  }

  async getNode(nodeId: string): Promise<AxiosResponse<Node>> {
    return this.client.get(`/nodes/${nodeId}`);
  }

  async getPortActivity(): Promise<AxiosResponse<PortActivityEntry[]>> {
    return this.client.get('/ports/activity');
  }

  async getNodePositionHistory(
    nodeId: string,
    params?: { limit?: number; last?: ActivityTimeRange; since?: string; until?: string }
  ): Promise<AxiosResponse<NodePositionHistoryEntry[]>> {
    return this.client.get(`/nodes/${nodeId}/positions`, { params });
  }

  async getNodeTelemetryHistory(
    nodeId: string,
    params?: { limit?: number; last?: ActivityTimeRange; since?: string; until?: string }
  ): Promise<AxiosResponse<NodeTelemetryHistoryEntry[]>> {
    return this.client.get(`/nodes/${nodeId}/telemetry`, { params });
  }

  async getNodeLatencyHistory(
    nodeId: string,
    params?: { limit?: number; last?: ActivityTimeRange; since?: string; until?: string }
  ): Promise<AxiosResponse<NodeLatencyHistoryEntry[]>> {
    return this.client.get(`/nodes/${nodeId}/latency`, { params });
  }

  async getNodePortActivity(nodeId: string): Promise<AxiosResponse<NodePortActivityEntry[]>> {
    return this.client.get(`/nodes/${nodeId}/ports`);
  }

  async getNodePortPackets(
    nodeId: string,
    port: string,
    params?: { limit?: number; direction?: 'all' | 'sent' | 'received'; last?: ActivityTimeRange; since?: string; until?: string }
  ): Promise<AxiosResponse<NodePortPacketEntry[]>> {
    return this.client.get(`/nodes/${nodeId}/ports/${encodeURIComponent(port)}/packets`, { params });
  }

  async getPortNodeActivity(
    port: string,
    params?: { limit?: number; direction?: 'all' | 'sent' | 'received'; last?: ActivityTimeRange; since?: string; until?: string }
  ): Promise<AxiosResponse<PortNodeActivityEntry[]>> {
    return this.client.get(`/ports/${encodeURIComponent(port)}/nodes`, { params });
  }

  async getEdges(params?: { last?: ActivityTimeRange; since?: string; until?: string }): Promise<AxiosResponse<Edge[]>> {
    return this.client.get('/graph/edges', { params });
  }

  async getLinks(params?: {
    search?: string;
    node?: string;
    bidirectional?: boolean;
    last?: ActivityTimeRange;
    since?: string;
    until?: string;
    limit?: number;
    offset?: number;
    port?: string;
  }): Promise<AxiosResponse<NodeLink[]>> {
    const queryParams: Record<string, unknown> = {};

    if (params) {
      if (params.search) queryParams.search = params.search;
      if (params.node) queryParams.node = params.node;
      if (typeof params.bidirectional === 'boolean') {
        queryParams.bidirectional = params.bidirectional ? 'true' : 'false';
      }
      if (params.last) queryParams.last = params.last;
      if (params.since) queryParams.since = params.since;
      if (params.until) queryParams.until = params.until;
      if (typeof params.limit === 'number') queryParams.limit = params.limit;
      if (typeof params.offset === 'number') queryParams.offset = params.offset;
      if (params.port) queryParams.port = params.port;
    }

    return this.client.get('/links/', { params: queryParams });
  }

  async getLink(linkId: number): Promise<AxiosResponse<NodeLink>> {
    return this.client.get(`/links/${linkId}`);
  }

  async getLinkPackets(
    linkId: number,
    params?: { order?: 'asc' | 'desc'; limit?: number; last?: ActivityTimeRange; since?: string; until?: string; port?: string }
  ): Promise<AxiosResponse<NodeLinkPacket[]>> {
    return this.client.get(`/links/${linkId}/packets`, { params });
  }

  async getChannelStatistics(): Promise<AxiosResponse<ChannelStatistics>> {
    return this.client.get('/channels/statistics');
  }

  async getChannel(channelId: string, channelNum: number): Promise<AxiosResponse<ChannelDetail>> {
    return this.client.get(`/channels/${channelId}/${channelNum}`);
  }

  async checkStatus(): Promise<AxiosResponse<{ status: string }>> {
    return this.client.get('/status');
  }

  async getInterfaces(): Promise<AxiosResponse<Interface[]>> {
    return this.client.get('/interfaces/');
  }

  async getOverviewMetrics(params?: {
    include_history?: boolean;
    history_last?: string;
    history_since?: string;
    history_until?: string;
    history_limit?: number;
    record_snapshot?: boolean;
  }): Promise<AxiosResponse<OverviewMetricsResponse>> {
    return this.client.get('/metrics/overview', { params });
  }

  async getVirtualNodes(): Promise<AxiosResponse<Node[]>> {
    return this.client.get('/nodes/virtual');
  }

  async getVirtualNodeOptions(): Promise<AxiosResponse<VirtualNodeOptionsResponse>> {
    // Request virtual node options without attaching the Authorization
    // header to avoid triggering a CORS preflight in the browser. These
    // options are non-sensitive metadata and can be fetched anonymously.
    return this.client.get('/nodes/virtual/options', { _skipAuth: true } as any);
  }

  async getVirtualNodePrefill(): Promise<AxiosResponse<VirtualNodePrefillResponse>> {
    // Prefill also returns non-sensitive suggestions; fetch without auth
    // to avoid preflight issues when possible.
    return this.client.get('/nodes/virtual/prefill', { _skipAuth: true } as any);
  }

  async createVirtualNode(payload: VirtualNodePayload): Promise<AxiosResponse<VirtualNodeSecretResponse>> {
    return this.client.post('/nodes/virtual', payload);
  }

  async updateVirtualNode(nodeId: string, payload: VirtualNodeUpdatePayload): Promise<AxiosResponse<VirtualNodeSecretResponse>> {
    return this.client.put(`/nodes/virtual/${encodeURIComponent(nodeId)}`, payload);
  }

  async deleteVirtualNode(nodeId: string): Promise<AxiosResponse<MessageResponse>> {
    return this.client.delete(`/nodes/virtual/${encodeURIComponent(nodeId)}`);
  }

  // Capture endpoints
  async getCaptureSessions(): Promise<AxiosResponse<CaptureSession[]>> {
    return this.client.get('/captures/sessions');
  }

  async startCapture(payload: { name: string; interface_id?: number }): Promise<AxiosResponse<{ session: CaptureSession }>> {
    return this.client.post('/captures/start', payload);
  }

  async stopCapture(sessionId: string): Promise<AxiosResponse<CaptureSession>> {
    return this.client.post(`/captures/${sessionId}/stop`);
  }

  async cancelCapture(sessionId: string): Promise<AxiosResponse<MessageResponse>> {
    return this.client.post(`/captures/${sessionId}/cancel`);
  }

  async deleteCapture(sessionId: string): Promise<AxiosResponse<MessageResponse>> {
    return this.client.delete(`/captures/${sessionId}`);
  }

  async deleteAllCaptures(): Promise<AxiosResponse<{ deleted: number }>> {
    return this.client.delete('/captures/sessions');
  }

  async downloadCapture(sessionId: string): Promise<Blob> {
    const response = await this.client.get(`/captures/${sessionId}/download`, {
      responseType: 'blob',
    });
    return response.data;
  }

  // Publisher endpoints
  async publishTextMessage(payload: PublishTextMessagePayload): Promise<AxiosResponse<MessageResponse>> {
    return this.client.post('/publisher/publish/text-message', payload);
  }

  async publishNodeInfo(payload: PublishNodeInfoPayload): Promise<AxiosResponse<MessageResponse>> {
    return this.client.post('/publisher/publish/nodeinfo', payload);
  }

  async publishPosition(payload: PublishPositionPayload): Promise<AxiosResponse<MessageResponse>> {
    return this.client.post('/publisher/publish/position', payload);
  }

  // Request data/telemetry from a node — frontend-side payload used to ask
  // the device to reply (backend support required to act on this request).
  async publishTelemetry(payload: PublishTelemetryPayload): Promise<AxiosResponse<MessageResponse>> {
    return this.client.post('/publisher/publish/telemetry', payload);
  }

  async publishTraceroute(payload: PublishTraceroutePayload): Promise<AxiosResponse<MessageResponse>> {
    return this.client.post('/publisher/publish/traceroute', payload);
  }

  async publishReachability(payload: PublishReachabilityPayload): Promise<AxiosResponse<MessageResponse>> {
    return this.client.post('/publisher/publish/reachability-test', payload);
  }

  async getPublisherReactiveStatus(): Promise<AxiosResponse<PublisherReactiveStatus>> {
    return this.client.get('/publisher/reactive/status');
  }

  async updatePublisherReactiveConfig(payload: PublisherReactiveConfigUpdatePayload): Promise<AxiosResponse<PublisherReactiveStatus>> {
    return this.client.post('/publisher/reactive/config', payload);
  }

  async getPublisherPeriodicJobs(): Promise<AxiosResponse<PublisherPeriodicJob[]>> {
    return this.client.get('/publisher/periodic/jobs');
  }

  async createPublisherPeriodicJob(payload: PublisherPeriodicJobCreatePayload): Promise<AxiosResponse<PublisherPeriodicJob>> {
    return this.client.post('/publisher/periodic/jobs', payload);
  }

  async updatePublisherPeriodicJob(jobId: number, payload: PublisherPeriodicJobUpdatePayload): Promise<AxiosResponse<PublisherPeriodicJob>> {
    return this.client.put(`/publisher/periodic/jobs/${jobId}`, payload);
  }

  async deletePublisherPeriodicJob(jobId: number): Promise<AxiosResponse<MessageResponse>> {
    return this.client.delete(`/publisher/periodic/jobs/${jobId}`);
  }
}

export const apiClient = new ApiClient();
