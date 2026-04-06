import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Register = () => {
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '', role: 'tourist' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();
  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try { const u = await register(form.name, form.email, form.password, form.phone, form.role); navigate(u.role === 'admin' ? '/admin' : '/dashboard'); }
    catch (err) { setError(err.response?.data?.error || 'Registration failed'); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center px-4 py-8">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8"><h2 className="text-2xl font-bold text-gray-800">Create Account</h2><p className="text-gray-500 text-sm mt-1">Join WanderMate</p></div>
        {error && <div className="bg-red-50 border border-red-400 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="text" name="name" value={form.name} onChange={handleChange} className="w-full px-4 py-3 border rounded-lg" placeholder="Full Name" required />
          <input type="email" name="email" value={form.email} onChange={handleChange} className="w-full px-4 py-3 border rounded-lg" placeholder="Email" required />
          <input type="password" name="password" value={form.password} onChange={handleChange} className="w-full px-4 py-3 border rounded-lg" placeholder="Password (min 6)" required minLength={6} />
          <input type="tel" name="phone" value={form.phone} onChange={handleChange} className="w-full px-4 py-3 border rounded-lg" placeholder="Phone (optional)" />
          <select name="role" value={form.role} onChange={handleChange} className="w-full px-4 py-3 border rounded-lg">
            <option value="tourist">Tourist</option><option value="admin">Admin / Authority</option>
          </select>
          <button type="submit" disabled={loading} className="w-full py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50">{loading ? 'Creating...' : 'Create Account'}</button>
        </form>
        <p className="text-center text-sm text-gray-500 mt-6">Have an account? <Link to="/login" className="text-blue-600 font-medium hover:underline">Sign In</Link></p>
      </div>
    </div>
  );
};
export default Register;
