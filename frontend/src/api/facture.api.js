import { api } from './axios';

export const getFactures = async () => {
  const response = await api.get('/factures/');
  return response.data;
};

export const createFacture = async (payload) => {
  const response = await api.post('/factures/', payload);
  return response.data;
};

export const downloadFacture = async (id) => {
  const response = await api.get(`/factures/${id}/download/`, { responseType: 'blob' });
  return response.data;
};
