import axios from 'axios';

export const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';
const CSRF_COOKIE_NAME = 'da_csrf';
const UNSAFE_METHODS = new Set(['post', 'put', 'patch', 'delete']);
let cachedCsrfToken = '';
const REFRESH_REVISION_KEY = 'da-session-refresh-revision';
const readRefreshRevision = () => {
  try { return localStorage.getItem(REFRESH_REVISION_KEY) || ''; } catch { return ''; }
};

export const readCsrfToken = () => {
  const cookie = document.cookie
    .split('; ')
    .find((item) => item.startsWith(`${CSRF_COOKIE_NAME}=`));
  return cookie ? decodeURIComponent(cookie.slice(CSRF_COOKIE_NAME.length + 1)) : cachedCsrfToken;
};

let csrfRequest;
export const ensureCsrfToken = async (force = false) => {
  if (!force && readCsrfToken()) return readCsrfToken();
  if (!csrfRequest) {
    csrfRequest = fetch(`${API_BASE_URL}/auth/csrf-token`, {
      credentials: 'include'
    }).then(async (response) => {
      if (!response.ok) throw new Error('Unable to initialize the secure session.');
      const data = await response.json();
      if (!data.csrfToken) throw new Error('Secure session token is unavailable.');
      cachedCsrfToken = data.csrfToken;
      return data.csrfToken;
    }).finally(() => {
      csrfRequest = null;
    });
  }
  return csrfRequest;
};

let fetchRefreshPromise;
const refreshSessionWithFetch = async (requestRevision) => {
  if (!fetchRefreshPromise) {
    const performRefresh = async () => {
      // A tab that waited for another tab must reuse the newly issued cookies,
      // not rotate the same refresh token a second time.
      if (requestRevision !== undefined && readRefreshRevision() !== requestRevision) return null;
      let csrfToken = await ensureCsrfToken();
      const request = () => fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-CSRF-Token': csrfToken }
      });
      let response = await request();
      if (response.status === 403) {
        const failure = await response.clone().json().catch(() => ({}));
        if (failure.code === 'CSRF_TOKEN_INVALID') {
          csrfToken = await ensureCsrfToken(true);
          response = await request();
        }
      }
      if (!response.ok) {
        const error = new Error('Session could not be refreshed.');
        error.status = response.status;
        throw error;
      }
      const data = await response.json();
      try { localStorage.setItem(REFRESH_REVISION_KEY, `${Date.now()}:${Math.random()}`); } catch { /* storage may be disabled */ }
      window.dispatchEvent(new CustomEvent('auth:session-refreshed', { detail: data }));
      return data;
    };
    fetchRefreshPromise = (navigator.locks?.request
      ? navigator.locks.request('destinasian-auth-refresh', performRefresh)
      : performRefresh()).finally(() => {
      fetchRefreshPromise = null;
    });
  }
  return fetchRefreshPromise;
};

export const initializeAuthSession = async () => {
  const data = await refreshSessionWithFetch(readRefreshRevision());
  if (data) return data;
  // Another tab already rotated the cookie. Read the session instead of
  // consuming the newly issued refresh token again.
  const response = await fetch(`${API_BASE_URL}/auth/me`, { credentials: 'include' });
  if (!response.ok) {
    const error = new Error('Unable to verify your session.');
    error.status = response.status;
    throw error;
  }
  return response.json();
};

export const secureFetch = async (path, options = {}) => {
  const requestRevision = readRefreshRevision();
  const method = String(options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers || {});
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    headers.set('X-CSRF-Token', await ensureCsrfToken());
  }
  const request = () => fetch(`${API_BASE_URL}${path}`, {
    ...options,
    method,
    headers,
    credentials: 'include'
  });
  let response = await request();
  if (response.status === 403 && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const failure = await response.clone().json().catch(() => ({}));
    if (failure.code === 'CSRF_TOKEN_INVALID') {
      headers.set('X-CSRF-Token', await ensureCsrfToken(true));
      response = await request();
    }
  }
  const publicAuthPaths = new Set([
    '/auth/login',
    '/auth/register',
    '/auth/refresh',
    '/auth/logout',
    '/auth/2fa/verify-login',
    '/auth/forgot-password',
    '/auth/reset-password'
  ]);

  if (response.status !== 401 || publicAuthPaths.has(path) || options.skipAuthRefresh) {
    return response;
  }

  try {
    await refreshSessionWithFetch(requestRevision);
    return request();
  } catch (refreshError) {
    if (refreshError?.status === 401 || refreshError?.status === 403) {
      window.dispatchEvent(new Event('auth:session-expired'));
    } else {
      window.dispatchEvent(new CustomEvent('auth:session-warning', {
        detail: 'Unable to verify your session because the network is unavailable.'
      }));
    }
    return response;
  }
};

const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true
});

axiosInstance.interceptors.request.use(async (config) => {
  if (config._refreshRevision === undefined) config._refreshRevision = readRefreshRevision();
  if (UNSAFE_METHODS.has(String(config.method || 'get').toLowerCase())) {
    const csrfToken = await ensureCsrfToken();
    if (csrfToken) config.headers['X-CSRF-Token'] = csrfToken;
  }
  return config;
});

axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config || {};
    const requestUrl = String(originalRequest.url || '');
    const isAuthLifecycleRequest = requestUrl.includes('/auth/login')
      || requestUrl.includes('/auth/refresh')
      || requestUrl.includes('/auth/logout');

    if (error.response?.status === 401 && !originalRequest._authRetried && !isAuthLifecycleRequest) {
      originalRequest._authRetried = true;
      try {
        await refreshSessionWithFetch(originalRequest._refreshRevision);
        return axiosInstance(originalRequest);
      } catch (refreshError) {
        if (refreshError.status === 401 || refreshError.status === 403) {
          localStorage.removeItem('authToken');
          localStorage.removeItem('user');
          localStorage.removeItem('currentAccount');
          localStorage.removeItem('accounts');
          window.dispatchEvent(new Event('auth:session-expired'));
        } else {
          window.dispatchEvent(new CustomEvent('auth:session-warning', {
            detail: 'Unable to verify your session because the network is unavailable.'
          }));
        }
      }
    }

    if (error.response?.status === 403
      && error.response?.data?.code === 'CSRF_TOKEN_INVALID'
      && !originalRequest._csrfRetried) {
      originalRequest._csrfRetried = true;
      try {
        const csrfToken = await ensureCsrfToken(true);
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers['X-CSRF-Token'] = csrfToken;
        return axiosInstance(originalRequest);
      } catch (csrfError) {
        // Preserve and return the original server error below.
      }
    }

    return Promise.reject(error);
  }
);

export const campaignAPI = {
  getAll: (params, config = {}) => axiosInstance.get('/campaigns', { ...config, params }),
  getById: (id, config = {}) => axiosInstance.get(`/campaigns/${id}`, config),
  create: (data) => axiosInstance.post('/campaigns', data),
  update: (id, data) => axiosInstance.put(`/campaigns/${id}`, data),
  delete: (id) => axiosInstance.delete(`/campaigns/${id}`),
  getAdUnitInventories: (id, config = {}) => axiosInstance.get(`/campaigns/${id}/ad-unit-inventories`, config),
  updateAdUnitInventories: (id, mappings) => axiosInstance.put(`/campaigns/${id}/ad-unit-inventories`, { mappings }),
  updateStatus: (id, status) => axiosInstance.put(`/campaigns/${id}`, { status })
};

export const adUnitAPI = {
  getAll: (params, config = {}) => axiosInstance.get('/ad-units', { ...config, params }),
  getById: (id, config = {}) => axiosInstance.get(`/ad-units/${id}`, config),
  getCreative: (id, signal) => axiosInstance.get(`/ad-units/${id}/creative`, {
    responseType: 'blob',
    signal
  }),
  getBannerLibrary: (signal) => axiosInstance.get('/ad-units/library/banners', { signal }),
  create: (data) => axiosInstance.post('/ad-units', data),
  update: (id, data) => axiosInstance.put(`/ad-units/${id}`, data),
  delete: (id) => axiosInstance.delete(`/ad-units/${id}`),
  updateStatus: (id, status) => axiosInstance.put(`/ad-units/${id}`, { status })
};

export const trackingAPI = {
  getAnalytics: (startDateOrParams, endDate, limit, inventoryFilter, config = {}) => {
    const params = typeof startDateOrParams === 'object'
      ? {
          ...startDateOrParams,
          inventoryGroup: startDateOrParams.inventoryGroup || startDateOrParams.groupName
        }
      : { startDate: startDateOrParams, endDate, limit, inventory: inventoryFilter };

    const requestConfig = typeof startDateOrParams === 'object' && endDate && typeof endDate === 'object'
      ? endDate
      : config;
    return axiosInstance.get('/tracking/analytics', { ...requestConfig, params });
  }
};

export const accountAPI = {
  getAll: () => axiosInstance.get('/accounts'),
  create: (data) => axiosInstance.post('/accounts', data),
  update: (id, data) => axiosInstance.put(`/accounts/${id}`, data),
  delete: (id) => axiosInstance.delete(`/accounts/${id}`),
  syncShare: (id, data) => axiosInstance.put(`/accounts/${id}/share`, data),
};

export const inventoryAPI = {
  getAll: (params, config = {}) => axiosInstance.get('/inventories', { ...config, params }),
  create: (data) => axiosInstance.post('/inventories', data),
  update: (id, data) => axiosInstance.put(`/inventories/${id}`, data),
  delete: (id) => axiosInstance.delete(`/inventories/${id}`)
};

export const userAPI = {
  getAll: () => axiosInstance.get('/users'),
  create: (data) => axiosInstance.post('/users', data),
  updateMe: (data) => axiosInstance.patch('/users/me', data),
  updateMyPassword: (data) => axiosInstance.patch('/users/me/password', data),
  reassignOwner: (data) => axiosInstance.post('/users/reassign-owner', data),
  update: (id, data) => axiosInstance.patch(`/users/${id}`, data),
  updatePassword: (id, data) => axiosInstance.patch(`/users/${id}/password`, data),
  updateStatus: (id, data) => axiosInstance.patch(`/users/${id}/status`, data),
  delete: (id, data) => axiosInstance.delete(`/users/${id}`, data ? { data } : undefined)
};
