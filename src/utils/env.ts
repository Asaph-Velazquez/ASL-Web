const DEFAULT_API_ORIGIN = 'http://localhost:3001';
const DEFAULT_WS_URL = 'ws://localhost:3001';
const DEFAULT_HOTEL_WS_PATH = '/ws/hotel';

function trimTrailingSlashes(value: string) {
  return value.replace(/\/+$/, '');
}

function ensureLeadingSlash(value: string) {
  if (!value || value === '/') {
    return '/';
  }

  return value.startsWith('/') ? value : `/${value}`;
}

function parseUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

export function getApiOrigin() {
  return trimTrailingSlashes(import.meta.env.VITE_API_URL || DEFAULT_API_ORIGIN);
}

export function getApiBase() {
  return `${getApiOrigin()}/api`;
}

export function getWsUrl() {
  const configuredUrl = import.meta.env.VITE_WS_URL;
  if (configuredUrl) {
    const parsed = parseUrl(configuredUrl);
    if (parsed?.pathname && parsed.pathname !== '/') {
      parsed.search = '';
      parsed.hash = '';
      return parsed.toString().replace(/\/$/, '');
    }
  }

  const fallbackBase = trimTrailingSlashes(configuredUrl || DEFAULT_WS_URL);
  const wsPath = ensureLeadingSlash(import.meta.env.VITE_HOTEL_WS_PATH || DEFAULT_HOTEL_WS_PATH);
  return `${fallbackBase}${wsPath}`;
}
