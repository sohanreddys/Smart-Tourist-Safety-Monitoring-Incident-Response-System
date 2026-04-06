import { io } from 'socket.io-client';
const SOCKET_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
let socket = null;

export const connectSocket = (user) => {
  if (socket?.connected) return socket;
  socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
  socket.on('connect', () => { socket.emit('user:join', { id: user.id, name: user.name, email: user.email, role: user.role }); });
  return socket;
};
export const getSocket = () => socket;
export const disconnectSocket = () => { if (socket) { socket.disconnect(); socket = null; } };
