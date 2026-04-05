import { io } from 'socket.io-client';
import { API_BASE } from './api';

let socket = null;

export const connectSocket = (user) => {
  if (socket?.connected) return socket;

  socket = io(API_BASE, { transports: ['websocket', 'polling'] });

  socket.on('connect', () => {
    console.log('Socket connected:', socket.id);
    socket.emit('user:join', {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  });

  socket.on('disconnect', () => {
    console.log('Socket disconnected');
  });

  return socket;
};

export const getSocket = () => socket;

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
