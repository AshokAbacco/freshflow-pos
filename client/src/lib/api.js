import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 15000,
});

let getToken = () => null;
let onUnauthorized = () => {};

/** Wired up in main.jsx so this module doesn't import the auth store (avoids a circular import). */
export function configureApi(handlers) {
  getToken = handlers.getToken;
  onUnauthorized = handlers.onUnauthorized;
}

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const code = error.response?.data?.error?.code;
    if (status === 401 && !error.config?.skipAuthHandling) onUnauthorized(code);
    return Promise.reject(error);
  },
);

export const isNetworkError = (err) => Boolean(err) && !err.response && !axios.isCancel(err);

export function errorMessage(err, fallback = 'Something went wrong. Try again.') {
  if (!err) return fallback;
  if (axios.isCancel(err)) return 'Request cancelled';
  if (isNetworkError(err)) return 'Cannot reach the server. Check the connection and try again.';
  return err.response?.data?.error?.message || err.message || fallback;
}
