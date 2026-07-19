const DEFAULT_API_ORIGIN = 'http://localhost:3001';
const DEFAULT_WS_URL = 'ws://localhost:3001';

function trimTrailingSlashes(value: string) {
  return value.replace(/\/+$/, '');
}

export function getApiOrigin() {
  return trimTrailingSlashes(import.meta.env.VITE_API_URL || DEFAULT_API_ORIGIN);
}

export function getApiBase() {
  return `${getApiOrigin()}/api`;
}

export function getWsUrl() {
  return trimTrailingSlashes(import.meta.env.VITE_WS_URL || DEFAULT_WS_URL);
}
