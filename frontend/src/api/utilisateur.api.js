import { api } from './axios';

export const getUtilisateurs = async () => {
  const response = await api.get('/utilisateurs/');
  return response.data;
};

export const getUtilisateur = async (id) => {
  const response = await api.get(`/utilisateurs/${encodeURIComponent(id)}/`);
  return response.data;
};

export const createUtilisateur = async (payload) => {
  const response = await api.post('/utilisateurs/register/', payload);
  return response.data;
};
