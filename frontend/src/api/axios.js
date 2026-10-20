import axios from 'axios';
import { clearTokens, getAccessToken, getRefreshToken, storeTokens } from '../features/auth/authSession';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

export const DATA_MUTATED_EVENT = 'atelier:data-mutated';

let refreshRequest;

function describeMutation(config) {
  const url = config.url || '';
  if (url.includes('/fournisseurs-fiables/')) {
    return 'Recommandation des fournisseurs fiables actualisée.';
  }
  const collection = url.split('?')[0].split('/').filter(Boolean).find((part) => !/^\d+$/.test(part));
  const labels = {
    fournisseurs: 'fournisseur',
    commandes: 'commande',
    produits: 'produit',
    factures: 'facture',
    paiements: 'paiement',
    utilisateurs: 'utilisateur',
  };
  const label = labels[collection] || 'élément';
  const method = config.method?.toLowerCase();
  const operation = method === 'post' ? 'ajouté' : method === 'delete' ? 'supprimé' : 'modifié';
  return `${label[0].toUpperCase()}${label.slice(1)} ${operation}.`;
}

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token && !config.skipAuthorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    const method = response.config.method?.toLowerCase();
    const isMutation = ['post', 'put', 'patch', 'delete'].includes(method);
    const isSupplierPrediction = response.config.url?.includes('/fournisseurs-fiables/');
    if (
      (isMutation || isSupplierPrediction)
      && !response.config.url?.includes('/token/')
      && !response.config.url?.includes('/notifications/')
      && typeof window !== 'undefined'
    ) {
      window.dispatchEvent(new CustomEvent(DATA_MUTATED_EVENT, {
        detail: { message: describeMutation(response.config), method, url: response.config.url },
      }));
    }
    return response;
  },
  async (error) => {
    const request = error.config;
    if (
      error.response?.status !== 401
      || !request
      || request._retry
      || request.skipAuthRefresh
      || request.url?.includes('/token/')
    ) {
      return Promise.reject(error);
    }

    const refresh = getRefreshToken();
    if (!refresh) {
      clearTokens();
      return Promise.reject(error);
    }

    request._retry = true;
    try {
      refreshRequest ||= api.post('/token/refresh/', { refresh }, { skipAuthRefresh: true })
        .then((response) => {
          if (typeof response.data?.access !== 'string') {
            throw new Error('Le serveur a renvoyé un jeton d’accès invalide.');
          }
          storeTokens({ access: response.data.access, refresh: response.data.refresh });
          return response.data.access;
        })
        .finally(() => { refreshRequest = null; });

      const access = await refreshRequest;
      request.headers.Authorization = `Bearer ${access}`;
      return api(request);
    } catch (refreshError) {
      clearTokens();
      return Promise.reject(refreshError);
    }
  },
);
