import { api } from './axios';

export const getNotifications = async () => {
  const response = await api.get('/notifications/');
  return response.data;
};

export const markNotificationRead = async (id) => {
  const response = await api.post(`/notifications/${id}/mark-read/`);
  return response.data;
};

export const markAllNotificationsRead = async () => {
  await api.post('/notifications/mark-all-read/');
};
