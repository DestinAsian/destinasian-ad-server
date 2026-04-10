import axios from 'axios';

export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

const axiosInstance = axios.create({
  baseURL: API_BASE_URL
});

// Add token to every request
axiosInstance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle token expiration
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('authToken');
      localStorage.removeItem('user');
      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);

export const campaignAPI = {
  getAll: (params) => axiosInstance.get('/campaigns', { params }),
  getById: (id) => axiosInstance.get(`/campaigns/${id}`),
  create: (data) => axiosInstance.post('/campaigns', data),
  update: (id, data) => axiosInstance.put(`/campaigns/${id}`, data),
  delete: (id) => axiosInstance.delete(`/campaigns/${id}`),
  getStats: (id) => axiosInstance.get(`/campaigns/${id}/stats`),
  updateStatus: (id, status) => axiosInstance.put(`/campaigns/${id}`, { status })
};

export const adUnitAPI = {
  getAll: (params) => axiosInstance.get('/ad-units', { params }),
  getById: (id) => axiosInstance.get(`/ad-units/${id}`),
  create: (data) => axiosInstance.post('/ad-units', data),
  update: (id, data) => axiosInstance.put(`/ad-units/${id}`, data),
  delete: (id) => axiosInstance.delete(`/ad-units/${id}`),
  getStats: (id) => axiosInstance.get(`/ad-units/${id}/stats`),
  getByCampaign: (campaignId, params) => axiosInstance.get(`/ad-units/campaign/${campaignId}`, { params }),
  updateStatus: (id, status) => axiosInstance.put(`/ad-units/${id}`, { status })
};

export const trackingAPI = {
  getStats: (startDateOrParams, endDate, inventoryGroup, campaignId) => {
    const params = typeof startDateOrParams === 'object'
      ? {
          ...startDateOrParams,
          inventoryGroup: startDateOrParams.inventoryGroup || startDateOrParams.groupName
        }
      : { startDate: startDateOrParams, endDate, inventoryGroup, campaignId };

    return axiosInstance.get('/tracking/stats', { params });
  },
  getAnalytics: (startDateOrParams, endDate, limit, groupName) => {
    const params = typeof startDateOrParams === 'object'
      ? {
          ...startDateOrParams,
          inventoryGroup: startDateOrParams.inventoryGroup || startDateOrParams.groupName
        }
      : { startDate: startDateOrParams, endDate, limit, inventoryGroup: groupName };

    return axiosInstance.get('/tracking/analytics', { params });
  }
};

export const accountAPI = {
  getAll: () => axiosInstance.get('/accounts'),
  getById: (id) => axiosInstance.get(`/accounts/${id}`),
  update: (id, data) => axiosInstance.put(`/accounts/${id}`, data),
  delete: (id) => axiosInstance.delete(`/accounts/${id}`),
  getStats: (id) => axiosInstance.get(`/accounts/${id}/stats`)
};

export const inventoryAPI = {
  getAll: (params) => axiosInstance.get('/inventories', { params }),
  getById: (id) => axiosInstance.get(`/inventories/${id}`),
  create: (data) => axiosInstance.post('/inventories', data),
  update: (id, data) => axiosInstance.put(`/inventories/${id}`, data),
  delete: (id) => axiosInstance.delete(`/inventories/${id}`)
};

export const inventoryGroupAPI = {
  getAll: () => axiosInstance.get('/inventory-groups'),
  create: (data) => axiosInstance.post('/inventory-groups', data),
  update: (id, data) => axiosInstance.put(`/inventory-groups/${id}`, data),
  delete: (id) => axiosInstance.delete(`/inventory-groups/${id}`)
};
