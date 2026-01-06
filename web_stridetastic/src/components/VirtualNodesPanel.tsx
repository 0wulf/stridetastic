'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, KeyRound, Loader2, Pencil, Plus, RefreshCw, Trash, X } from 'lucide-react';

import { apiClient } from '@/lib/api';
import {
  Node,
  VirtualNodePayload,
  VirtualNodeSecretResponse,
  VirtualNodeUpdatePayload,
  VirtualNodeOptionsResponse,
  VirtualNodePrefillResponse,
} from '@/types';
import { formatDate } from '@/lib/utils';

interface FormState {
  shortName: string;
  longName: string;
  role: string;
  hwModel: string;
  isLicensed: boolean;
  isUnmessagable: boolean;
  nodeId: string;
  regenerateKeys: boolean;
}

const DEFAULT_ROLE = 'CLIENT';
const DEFAULT_HARDWARE_MODEL = 'UNSET';

const createEmptyForm = (role: string = DEFAULT_ROLE, hwModel: string = DEFAULT_HARDWARE_MODEL): FormState => ({
  shortName: '',
  longName: '',
  role,
  hwModel,
  isLicensed: false,
  isUnmessagable: false,
  nodeId: '',
  regenerateKeys: false,
});

const resolveErrorMessage = (error: unknown): string => {
  const maybeResponse = (error as any)?.response?.data;
  if (maybeResponse?.message) {
    return String(maybeResponse.message);
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred';
};

const formatRelativeTime = (timestamp?: string | null): string => {
  if (!timestamp) {
    return 'Never';
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  if (diffMinutes < 1) {
    return 'Just now';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
};

const buildFormFromNode = (
  node: Node,
  defaults: { role: string; hwModel: string }
): FormState => ({
  shortName: node.short_name ?? '',
  longName: node.long_name ?? '',
  role: node.role ?? defaults.role,
  hwModel: node.hw_model ?? defaults.hwModel,
  isLicensed: Boolean(node.is_licensed),
  isUnmessagable: Boolean(node.is_unmessagable),
  nodeId: node.node_id ?? '',
  regenerateKeys: false,
});

const hasSecrets = (secrets: VirtualNodeSecretResponse | null): secrets is VirtualNodeSecretResponse => {
  if (!secrets) {
    return false;
  }
  return Boolean(secrets.private_key) || Boolean(secrets.public_key);
};

export default function VirtualNodesPanel(): React.ReactElement {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [globalMessage, setGlobalMessage] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState<boolean>(false);
  const [formState, setFormState] = useState<FormState>(() => createEmptyForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [editingNode, setEditingNode] = useState<Node | null>(null);

  const [options, setOptions] = useState<VirtualNodeOptionsResponse | null>(null);
  const [optionsLoading, setOptionsLoading] = useState<boolean>(true);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  const [pendingSecrets, setPendingSecrets] = useState<VirtualNodeSecretResponse | null>(null);
  const [rotatingId, setRotatingId] = useState<string | null>(null);
  const [rotateConfirmNode, setRotateConfirmNode] = useState<Node | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [prefillLoading, setPrefillLoading] = useState<boolean>(false);
  const [prefillError, setPrefillError] = useState<string | null>(null);
  const [hardwareSearch, setHardwareSearch] = useState<string>('');
  const [showHardwareSuggestions, setShowHardwareSuggestions] = useState<boolean>(false);

  const defaultRole = options?.default_role ?? DEFAULT_ROLE;
  const defaultHardwareModel = options?.default_hardware_model ?? DEFAULT_HARDWARE_MODEL;

  const fetchNodes = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient.getVirtualNodes();
      setNodes(response.data);
    } catch (err) {
      setError(resolveErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const applyPrefill = useCallback((prefill: VirtualNodePrefillResponse) => {
    setFormState((prev) => ({
      ...prev,
      shortName: prefill.short_name,
      longName: prefill.long_name,
      nodeId: prefill.node_id,
    }));
  }, []);

  const loadPrefill = useCallback(async () => {
    setPrefillLoading(true);
    setPrefillError(null);
    try {
      const response = await apiClient.getVirtualNodePrefill();
      applyPrefill(response.data);
    } catch (err) {
      setPrefillError(resolveErrorMessage(err));
    } finally {
      setPrefillLoading(false);
    }
  }, [applyPrefill]);

  const hardwareOptions = useMemo(() => options?.hardware_models ?? [], [options]);
  const filteredHardwareModels = useMemo(() => {
    if (!hardwareOptions.length) {
      return hardwareOptions;
    }
    const term = hardwareSearch.trim().toLowerCase();
    let filtered = hardwareOptions;
    if (term) {
      filtered = hardwareOptions.filter((option) =>
        option.label.toLowerCase().includes(term) || option.value.toLowerCase().includes(term)
      );
    }
    const selected = hardwareOptions.find((option) => option.value === formState.hwModel);
    if (selected && !filtered.some((option) => option.value === selected.value)) {
      filtered = [selected, ...filtered];
    }
    return filtered.slice(0, 20);
  }, [hardwareOptions, hardwareSearch, formState.hwModel]);

  const resolveHardwareLabel = useCallback(
    (value: string | null | undefined): string => {
      if (!value) {
        return '';
      }
      const match = hardwareOptions.find((option) => option.value === value);
      return match ? match.label : value;
    },
    [hardwareOptions]
  );

  useEffect(() => {
    if (showHardwareSuggestions) {
      return;
    }
    const label = resolveHardwareLabel(formState.hwModel);
    if (!label) {
      return;
    }
    if ((hardwareSearch === '' || hardwareSearch === formState.hwModel) && hardwareSearch !== label) {
      setHardwareSearch(label);
    }
  }, [formState.hwModel, resolveHardwareLabel, hardwareSearch, showHardwareSuggestions]);

  useEffect(() => {
    void fetchNodes();
  }, [fetchNodes]);

  useEffect(() => {
    let isActive = true;
    const loadOptions = async () => {
      setOptionsLoading(true);
      setOptionsError(null);
      try {
        const response = await apiClient.getVirtualNodeOptions();
        if (!isActive) {
          return;
        }
        setOptions(response.data);
      } catch (err) {
        if (!isActive) {
          return;
        }
        setOptionsError(resolveErrorMessage(err));
      } finally {
        if (isActive) {
          setOptionsLoading(false);
        }
      }
    };

    void loadOptions();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (editingNode || formOpen || !options) {
      return;
    }
    setFormState(createEmptyForm(options.default_role, options.default_hardware_model));
  }, [options, editingNode, formOpen]);

  const resetForm = useCallback(() => {
    const baseline = createEmptyForm(defaultRole, defaultHardwareModel);
    setFormState(baseline);
    setFormError(null);
    setEditingNode(null);
    setPrefillError(null);
    setPrefillLoading(false);
    setHardwareSearch(resolveHardwareLabel(baseline.hwModel));
    setShowHardwareSuggestions(false);
  }, [defaultRole, defaultHardwareModel, resolveHardwareLabel]);

  const handleCloseForm = () => {
    setFormOpen(false);
    resetForm();
  };

  const handleOpenCreate = () => {
    resetForm();
    void loadPrefill();
    setFormOpen(true);
  };

  const handleEdit = (node: Node) => {
    setFormState(buildFormFromNode(node, { role: defaultRole, hwModel: defaultHardwareModel }));
    setEditingNode(node);
    setFormError(null);
    setHardwareSearch(resolveHardwareLabel(node.hw_model ?? defaultHardwareModel));
    setShowHardwareSuggestions(false);
    setFormOpen(true);
  };

  const handleTextChange = (field: keyof FormState) => (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    let value = event.target.value;
    if (field === 'nodeId') {
      const normalized = value.toLowerCase().replace(/[^!0-9a-f]/g, '');
      const withoutPrefix = normalized.replace(/^!+/, '');
      value = withoutPrefix ? `!${withoutPrefix}` : '';
    }
    setFormState((prev) => ({ ...prev, [field]: value } as FormState));
  };

  const handleSelectChange = (field: keyof FormState) => (
    event: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const value = event.target.value;
    setFormState((prev) => ({ ...prev, [field]: value } as FormState));
  };

  const handleCheckboxChange = (field: keyof FormState) => (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const checked = event.target.checked;
    setFormState((prev) => ({ ...prev, [field]: checked } as FormState));
  };

  const handlePickHardware = useCallback(
    (option: VirtualNodeOptionsResponse['hardware_models'][number]) => {
      setFormState((prev) => ({ ...prev, hwModel: option.value } as FormState));
      setHardwareSearch(option.label);
      setShowHardwareSuggestions(false);
    },
    [setFormState, setHardwareSearch, setShowHardwareSuggestions]
  );

  const buildVirtualNodePayload = (isUpdate: boolean): VirtualNodePayload => {
    const payload: VirtualNodePayload = {};

    const assignNullableStringField = (
      value: string,
      field: keyof Pick<VirtualNodePayload, 'short_name' | 'long_name' | 'role' | 'hw_model'>
    ) => {
      const trimmed = value.trim();
      if (trimmed) {
        payload[field] = trimmed;
      } else if (isUpdate) {
        payload[field] = null;
      }
    };

    const assignIdentityField = (
      value: string,
      field: keyof Pick<VirtualNodePayload, 'node_id'>
    ) => {
      const trimmed = value.trim();
      if (trimmed) {
        payload[field] = trimmed;
      }
    };

    assignNullableStringField(formState.shortName, 'short_name');
    assignNullableStringField(formState.longName, 'long_name');
    assignNullableStringField(formState.role, 'role');
    assignNullableStringField(formState.hwModel, 'hw_model');

    payload.is_licensed = formState.isLicensed;
    payload.is_unmessagable = formState.isUnmessagable;

    assignIdentityField(formState.nodeId, 'node_id');

    return payload;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setError(null);
    setGlobalMessage(null);

    setIsSaving(true);

    const wasEditing = Boolean(editingNode);
    const regenerateRequested = Boolean(editingNode && formState.regenerateKeys);

    try {
      const payload = buildVirtualNodePayload(wasEditing);

      let response;
      if (wasEditing && editingNode) {
        const updatePayload: VirtualNodeUpdatePayload = {
          ...payload,
          regenerate_keys: formState.regenerateKeys,
        };
        response = await apiClient.updateVirtualNode(editingNode.node_id, updatePayload);
      } else {
        response = await apiClient.createVirtualNode(payload);
      }

      const secrets = response.data;
      setFormOpen(false);
      resetForm();
      await fetchNodes();

      if (hasSecrets(secrets) && regenerateRequested) {
        setPendingSecrets(secrets);
      }

      if (wasEditing) {
        setGlobalMessage('Virtual node updated successfully');
      } else {
        setGlobalMessage('Virtual node created successfully');
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Node number')) {
        setFormError(err.message);
        return;
      }
      setFormError(resolveErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleRefresh = async () => {
    setGlobalMessage(null);
    setError(null);
    await fetchNodes();
  };

  const performRotateKeys = useCallback(
    async (node: Node) => {
      setRotatingId(node.node_id);
      setError(null);
      setGlobalMessage(null);
      try {
        const response = await apiClient.updateVirtualNode(node.node_id, { regenerate_keys: true });
        const secrets = response.data;
        if (hasSecrets(secrets)) {
          setPendingSecrets(secrets);
        }
        await fetchNodes();
        setGlobalMessage(`New key pair generated for ${node.short_name || node.node_id}`);
      } catch (err) {
        setError(resolveErrorMessage(err));
      } finally {
        setRotatingId(null);
      }
    },
    [fetchNodes]
  );

  const handleConfirmRotate = useCallback(
    (node: Node) => {
      setRotateConfirmNode(null);
      void performRotateKeys(node);
    },
    [performRotateKeys]
  );

  const handleCancelRotate = () => {
    setRotateConfirmNode(null);
  };

  const handleDelete = async (node: Node) => {
    const confirmed = window.confirm(
      `Delete virtual node ${node.short_name || node.node_id}? This action cannot be undone.`
    );
    if (!confirmed) {
      return;
    }

    setDeletingId(node.node_id);
    setError(null);
    setGlobalMessage(null);
    try {
      await apiClient.deleteVirtualNode(node.node_id);
      await fetchNodes();
      setGlobalMessage('Virtual node deleted');
    } catch (err) {
      setError(resolveErrorMessage(err));
    } finally {
      setDeletingId(null);
    }
  };

  const visibleNodes = useMemo(
    () => [...nodes].sort((a, b) => a.node_id.localeCompare(b.node_id)),
    [nodes]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Virtual Nodes</h1>
          <p className="text-sm text-gray-500">Create and manage virtual Meshtastic identities, including key rotation.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            className="inline-flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            disabled={isLoading}
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </button>
          <button
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={optionsLoading}
          >
            <Plus className="h-4 w-4" />
            New Virtual Node
          </button>
        </div>
      </div>

      {globalMessage && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          {globalMessage}
        </div>
      )}

      {optionsError && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Unable to load Meshtastic role and hardware metadata: {optionsError}
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                Name
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                Node Identity
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                Key Updated
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                Public Key
              </th>
              <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-500">
                  <div className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Fetching virtual nodes...
                  </div>
                </td>
              </tr>
            ) : visibleNodes.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-500">
                  No virtual nodes created yet.
                </td>
              </tr>
            ) : (
              visibleNodes.map((node) => {
                const nameLabel = node.long_name || node.short_name || node.node_id;
                const publicKeyPreview = node.public_key ? `${node.public_key.slice(0, 12)}…${node.public_key.slice(-6)}` : '—';

                return (
                  <tr key={node.node_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 align-top text-sm text-gray-900">
                      <div className="font-semibold">{nameLabel}</div>
                      <div className="text-xs text-gray-500">Last seen {formatRelativeTime(node.last_seen)}</div>
                    </td>
                    <td className="px-4 py-3 align-top text-sm text-gray-700">
                      <div className="font-mono text-xs text-gray-800">{node.node_id}</div>
                      <div className="text-xs text-gray-500">Node #{node.node_num}</div>
                      <div className="text-xs text-gray-500">MAC {node.mac_address || '—'}</div>
                    </td>
                    <td className="px-4 py-3 align-top text-sm text-gray-700">
                      {node.private_key_updated_at ? (
                        <>
                          <div>{formatRelativeTime(node.private_key_updated_at)}</div>
                          <div className="text-xs text-gray-500">{formatDate(node.private_key_updated_at)}</div>
                        </>
                      ) : (
                        <div className="text-xs text-gray-500">Not generated</div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top text-sm text-gray-700">
                      <div className="font-mono text-xs text-gray-800">{publicKeyPreview}</div>
                    </td>
                    <td className="px-4 py-3 align-top text-sm">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleEdit(node)}
                          className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </button>
                        <button
                          onClick={() => setRotateConfirmNode(node)}
                          className="inline-flex items-center gap-1 rounded-md border border-indigo-200 px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
                          disabled={rotatingId === node.node_id}
                        >
                          {rotatingId === node.node_id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <KeyRound className="h-3.5 w-3.5" />
                          )}
                          Rotate Keys
                        </button>
                        <button
                          onClick={() => handleDelete(node)}
                          className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                          disabled={deletingId === node.node_id}
                        >
                          {deletingId === node.node_id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash className="h-3.5 w-3.5" />
                          )}
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {formOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 px-3">
          <div className="relative w-full max-w-3xl rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {editingNode ? 'Edit Virtual Node' : 'Create Virtual Node'}
                </h2>
                <p className="text-sm text-gray-500">
                  {editingNode
                    ? 'Update node metadata or generate a new key pair.'
                    : 'Provide optional metadata or leave blank to auto-generate identifiers.'}
                </p>
              </div>
              <button
                onClick={handleCloseForm}
                className="rounded-md p-2 text-gray-500 hover:bg-gray-100"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-6">
              {formError && (
                <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {formError}
                </div>
              )}

              {!editingNode && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      void loadPrefill();
                    }}
                    className="inline-flex items-center gap-2 rounded-md border border-blue-200 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-70"
                    disabled={prefillLoading}
                  >
                    {prefillLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Refresh suggestions
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Short Name</label>
                  <input
                    type="text"
                    maxLength={4}
                    value={formState.shortName}
                    onChange={handleTextChange('shortName')}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Long Name</label>
                  <input
                    type="text"
                    maxLength={32}
                    value={formState.longName}
                    onChange={handleTextChange('longName')}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700">Node ID</label>
                  <input
                    type="text"
                    maxLength={10}
                    value={formState.nodeId}
                    onChange={handleTextChange('nodeId')}
                    placeholder="Auto-generate"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  {!editingNode && prefillLoading && (
                    <p className="mt-2 text-xs text-blue-600">Refreshing identity suggestions...</p>
                  )}
                  {!editingNode && prefillError && (
                    <p className="mt-2 text-sm text-red-600">{prefillError}</p>
                  )}
                  <p className="mt-2 text-xs text-gray-500">
                    Node number and MAC address will be generated automatically based on this ID when the node is saved.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Role</label>
                  <select
                    value={formState.role}
                    onChange={handleSelectChange('role')}
                    disabled={optionsLoading || !options}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                  >
                    {optionsLoading && (
                      <option value={formState.role || DEFAULT_ROLE}>
                        Loading role options...
                      </option>
                    )}
                    {!optionsLoading && options &&
                      options.roles.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    {!optionsLoading && !options && (
                      <option value={formState.role || DEFAULT_ROLE}>{formState.role || DEFAULT_ROLE}</option>
                    )}
                  </select>
                </div>
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700">Hardware Model</label>
                  <input
                    type="text"
                    value={hardwareSearch}
                    onFocus={() => {
                      if (!optionsLoading && hardwareOptions.length > 0) {
                        setShowHardwareSuggestions(true);
                      }
                    }}
                    onBlur={() => {
                      setTimeout(() => setShowHardwareSuggestions(false), 120);
                      const label = resolveHardwareLabel(formState.hwModel);
                      if (label) {
                        setHardwareSearch(label);
                      }
                    }}
                    onChange={(event) => {
                      const value = event.target.value;
                      setHardwareSearch(value);
                      if (!showHardwareSuggestions) {
                        setShowHardwareSuggestions(true);
                      }
                    }}
                    placeholder={optionsLoading ? 'Loading hardware models...' : 'Type to search hardware models'}
                    disabled={optionsLoading || hardwareOptions.length === 0}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  {showHardwareSuggestions && filteredHardwareModels.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg max-h-60 overflow-auto">
                      {filteredHardwareModels.map((option) => {
                        const isActive = option.value === formState.hwModel;
                        return (
                          <div
                            key={option.value}
                            role="button"
                            tabIndex={-1}
                            onMouseDown={(event) => {
                              event.preventDefault();
                              handlePickHardware(option);
                            }}
                            className={
                              `px-3 py-2 text-sm cursor-pointer ${
                                isActive ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-900 hover:bg-blue-50'
                              }`
                            }
                          >
                            <div>{option.label}</div>
                            <div className="text-xs text-gray-500">{option.value}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {!optionsLoading && hardwareOptions.length > 0 && filteredHardwareModels.length === 0 && hardwareSearch.trim() && (
                    <p className="mt-2 text-xs text-red-600">No hardware models match &quot;{hardwareSearch.trim()}&quot;.</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="isLicensed"
                    type="checkbox"
                    checked={formState.isLicensed}
                    onChange={handleCheckboxChange('isLicensed')}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="isLicensed" className="text-sm text-gray-700">Licensed Operator</label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="isUnmessagable"
                    type="checkbox"
                    checked={formState.isUnmessagable}
                    onChange={handleCheckboxChange('isUnmessagable')}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="isUnmessagable" className="text-sm text-gray-700">Unmessagable</label>
                </div>
              </div>


              {editingNode && (
                <div className="flex items-center gap-2 rounded-md border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
                  <input
                    id="regenerateKeys"
                    type="checkbox"
                    checked={formState.regenerateKeys}
                    onChange={handleCheckboxChange('regenerateKeys')}
                    className="h-4 w-4 rounded border-yellow-300 text-yellow-600 focus:ring-yellow-500"
                  />
                  <label htmlFor="regenerateKeys">
                    Generate a new key pair for this node (previous private key will be replaced)
                  </label>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-4">
                <button
                  type="button"
                  onClick={handleCloseForm}
                  className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                  disabled={isSaving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
                  disabled={isSaving}
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                  {editingNode ? 'Save changes' : 'Create node'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {rotateConfirmNode && (
        <RotateConfirmationDialog
          node={rotateConfirmNode}
          isRotating={rotatingId === rotateConfirmNode.node_id}
          onConfirm={handleConfirmRotate}
          onCancel={handleCancelRotate}
        />
      )}

      {hasSecrets(pendingSecrets) && (
        <SecretsDialog secrets={pendingSecrets!} onClose={() => setPendingSecrets(null)} />
      )}
    </div>
  );
}

interface RotateConfirmationDialogProps {
  node: Node;
  isRotating: boolean;
  onConfirm: (node: Node) => void;
  onCancel: () => void;
}

function RotateConfirmationDialog({ node, isRotating, onConfirm, onCancel }: RotateConfirmationDialogProps): React.ReactElement {
  const nodeLabel = node.long_name || node.short_name || node.node_id;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">Confirm Key Rotation</h3>
          <button
            onClick={onCancel}
            className="rounded-md p-2 text-gray-500 hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 px-6 py-5">
          <p className="text-sm text-gray-600">
            Rotating the key pair for <span className="font-semibold text-gray-900">{nodeLabel}</span> will replace its
            public key. Any systems that rely on the current key will stop working until they are updated.
          </p>
          <p className="text-sm text-gray-600">Are you sure you want to continue?</p>
          <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
              disabled={isRotating}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onConfirm(node)}
              className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-70"
              disabled={isRotating}
            >
              {isRotating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Rotate key pair
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface SecretsDialogProps {
  secrets: VirtualNodeSecretResponse;
  onClose: () => void;
}

function SecretsDialog({ secrets, onClose }: SecretsDialogProps): React.ReactElement {
  const [copiedField, setCopiedField] = useState<'public' | 'private' | null>(null);

  const handleCopy = async (value: string, field: 'public' | 'private') => {
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard) {
        return;
      }
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (_error) {
      setCopiedField(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Store This Key Pair Safely</h3>
            <p className="text-sm text-gray-500">
              Private keys are shown only once. Store them in a secure location before closing.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-2 text-gray-500 hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-5 px-6 py-5">
          <div>
            <h4 className="text-sm font-medium text-gray-700">Node</h4>
            <p className="text-sm text-gray-900">
              {secrets.node.long_name || secrets.node.short_name || secrets.node.node_id}
            </p>
            <p className="text-xs text-gray-500 font-mono">{secrets.node.node_id}</p>
          </div>

          {secrets.public_key && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Public Key</label>
              <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                <code className="flex-1 break-all text-xs text-gray-800">{secrets.public_key}</code>
                <button
                  type="button"
                  onClick={() => handleCopy(secrets.public_key as string, 'public')}
                  className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copiedField === 'public' ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          )}

          {secrets.private_key && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Private Key</label>
              <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2">
                <code className="flex-1 break-all text-xs text-gray-800">{secrets.private_key}</code>
                <button
                  type="button"
                  onClick={() => handleCopy(secrets.private_key as string, 'private')}
                  className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-100"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copiedField === 'private' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="text-xs text-red-600">
                Keep this private key secret. Anyone with this key can impersonate the node.
              </p>
            </div>
          )}

          <div className="flex justify-end border-t border-gray-200 pt-4">
            <button
              onClick={onClose}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
            >
              I have stored the keys
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
