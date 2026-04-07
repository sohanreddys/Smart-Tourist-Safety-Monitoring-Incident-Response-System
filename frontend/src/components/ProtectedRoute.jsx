import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute = ({ children, requiredRole }) => {
  const { isAuthenticated, user, loading } = useAuth();
  if (loading) return <div style={{display:'flex',justifyContent:'center',alignItems:'center',height:'100vh'}}><p>Loading...</p></div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  // Admin route also accessible to responder departments (filtered views handled server-side)
  const RESPONDER_ROLES = ['admin', 'medical', 'police', 'fire', 'disaster'];
  if (requiredRole === 'admin') {
    if (!RESPONDER_ROLES.includes(user?.role)) return <Navigate to="/dashboard" replace />;
  } else if (requiredRole && user?.role !== requiredRole) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
};

export default ProtectedRoute;
