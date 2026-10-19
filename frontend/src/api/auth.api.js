import {api} from './axios';

export const login = async (credentials) => {
    const response = await api.post('/token/', credentials);
    return response.data;
};

export const register = async (userData) => {
    const response = await api.post('/utilisateurs/register/', userData);
    return response.data;
};

export const verifyRegistration = async (verificationData) => {
    const response = await api.post('/utilisateurs/verify-registration/', verificationData);
    return response.data;
};
