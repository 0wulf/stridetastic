export const PUBLISHING_RETURN_FOCUS_KEY = 'publishing-return-focus';

interface PublishingReturnFocusPayload {
  nodeId: string;
  originTab: string;
}

const isBrowser = typeof window !== 'undefined';

export function setPublishingReturnFocus(payload: PublishingReturnFocusPayload) {
  if (!isBrowser) return;
  try {
    window.sessionStorage.setItem(PUBLISHING_RETURN_FOCUS_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('Failed to store publishing focus payload', error);
  }
}

export function getPublishingReturnFocus(): PublishingReturnFocusPayload | null {
  if (!isBrowser) return null;
  try {
    const raw = window.sessionStorage.getItem(PUBLISHING_RETURN_FOCUS_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<PublishingReturnFocusPayload>;
    if (typeof parsed?.nodeId === 'string' && typeof parsed?.originTab === 'string') {
      return { nodeId: parsed.nodeId, originTab: parsed.originTab };
    }
    return null;
  } catch (error) {
    console.warn('Failed to read publishing focus payload', error);
    return null;
  }
}

export function clearPublishingReturnFocus() {
  if (!isBrowser) return;
  try {
    window.sessionStorage.removeItem(PUBLISHING_RETURN_FOCUS_KEY);
  } catch (error) {
    console.warn('Failed to clear publishing focus payload', error);
  }
}
