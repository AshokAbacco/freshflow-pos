import axios from 'axios';

/**
 * HTTP client for the platform panel.
 *
 * Deliberately a separate axios instance from lib/api.js. Sharing one would mean the store
 * user's token was attached to platform requests (which the server refuses outright), and a
 * 401 from the panel would run the store app's handler and sign the cashier out of their till.
 * Two surfaces, two clients, no crossover.
 *
 * The access token lives in memory only. It lasts 30 minutes and is restored from the HttpOnly
 * refresh cookie on reload, so there is nothing in localStorage for a cross-site script to
 * steal -- which matters more here than in the store app, because these accounts can move money.
 */
export const platformApi = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL || '/api'}/v1/platform`,
  timeout: 15000,
  // Carries the refresh cookie. Same-origin through the dev proxy, but explicit so it still
  // works if the panel is ever served from a different host to the API.
  withCredentials: true,
});

let accessToken = null;
let onSignedOut = () => {};

export const setPlatformAccessToken = (token) => {
  accessToken = token ?? null;
};
export const getPlatformAccessToken = () => accessToken;

/** Wired up by the auth store so this module does not import it (avoids a circular import). */
export function configurePlatformApi(handlers) {
  onSignedOut = handlers.onSignedOut ?? onSignedOut;
}

platformApi.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

/*
 * A 30-minute access token will expire mid-session, so one 401 is expected rather than
 * exceptional: swap it for a fresh token and replay the request. Concurrent calls share a
 * single refresh, otherwise six requests expiring together would fire six refreshes and five
 * of them would race.
 */
let refreshing = null;

/**
 * 401s that mean "the credentials you just typed were wrong", not "your session has ended".
 *
 * Without this distinction, getting your own password wrong on the account page reads as an
 * expired session: the client refreshes, replays the request, gets the same 401 and signs you
 * out of the panel. Being thrown out for mistyping a password you are in the middle of
 * changing is its own small disaster, so these are passed straight back to the form.
 */
const CREDENTIAL_CODES = new Set([
  'BAD_CURRENT_PASSWORD',
  'BAD_CREDENTIALS',
  'WRONG_TOKEN_AUDIENCE',
  'ACCOUNT_LOCKED',
  'WEAK_PASSWORD',
]);

const isCredentialFailure = (response) =>
  CREDENTIAL_CODES.has(response?.data?.error?.code);

async function refreshAccessToken() {
  refreshing =
    refreshing ??
    platformApi
      .post('/auth/refresh', null, { skipPlatformAuthRetry: true })
      .then(({ data }) => {
        setPlatformAccessToken(data.accessToken);
        return data;
      })
      .finally(() => {
        refreshing = null;
      });
  return refreshing;
}

platformApi.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;
    const status = response?.status;

    /*
     * A 401 about the credentials in the request body is the server answering the form, not
     * rejecting the session. Hand it back untouched: no refresh, no sign-out.
     */
    if (status === 401 && isCredentialFailure(response)) {
      return Promise.reject(error);
    }

    // Only a 401 is worth retrying. A 403 means the role is wrong, and no new token fixes that.
    if (status !== 401 || !config || config.skipPlatformAuthRetry || config.__retried) {
      if (status === 401 && !config?.skipPlatformAuthRetry) {
        setPlatformAccessToken(null);
        onSignedOut(response?.data?.error?.code);
      }
      return Promise.reject(error);
    }

    try {
      await refreshAccessToken();
      config.__retried = true;
      return await platformApi(config);
    } catch (refreshError) {
      setPlatformAccessToken(null);
      onSignedOut(response?.data?.error?.code);
      return Promise.reject(refreshError);
    }
  },
);

export const isNetworkError = (err) => Boolean(err) && !err.response && !axios.isCancel(err);

export function platformErrorMessage(err, fallback = 'Something went wrong. Try again.') {
  if (!err) return fallback;
  if (axios.isCancel(err)) return 'Request cancelled';
  if (isNetworkError(err)) {
    return 'Cannot reach the server. Check that the API is running on port 4000.';
  }
  return err.response?.data?.error?.message || err.message || fallback;
}

export { refreshAccessToken };
