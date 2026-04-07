import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Register = () => {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    name: '', email: '', password: '', phone: '', role: 'tourist',
    nationality: '', passportNumber: '', dateOfBirth: '', gender: '',
    emergencyContactName: '', emergencyContactPhone: '', emergencyContactRelation: '',
    address: '', bloodGroup: '', medicalConditions: '', preferredLanguage: 'English', travelPurpose: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();
  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const u = await register(form);
      navigate(u.role === 'admin' ? '/admin' : '/dashboard');
    } catch (err) { setError(err.response?.data?.error || 'Registration failed'); }
    finally { setLoading(false); }
  };

  const nextStep = () => {
    if (step === 1 && (!form.name || !form.email || !form.password)) {
      setError('Name, email and password are required');
      return;
    }
    if (step === 1 && form.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setError('');
    setStep(step + 1);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center px-4 py-8">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-lg">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Create Account</h2>
          <p className="text-gray-500 text-sm mt-1">Join WanderMate — Step {step} of 3</p>
          <div className="flex justify-center mt-3 space-x-2">
            {[1, 2, 3].map(s => (
              <div key={s} className={'h-2 rounded-full transition-all ' + (s <= step ? 'bg-blue-600 w-12' : 'bg-gray-200 w-8')} />
            ))}
          </div>
        </div>

        {error && <div className="bg-red-50 border border-red-400 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          {step === 1 && (
            <>
              <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Basic Information</h3>
              <input type="text" name="name" value={form.name} onChange={handleChange} className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Full Name *" required />
              <input type="email" name="email" value={form.email} onChange={handleChange} className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Email *" required />
              <input type="password" name="password" value={form.password} onChange={handleChange} className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Password (min 6) *" required minLength={6} />
              <input type="tel" name="phone" value={form.phone} onChange={handleChange} className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Phone Number" />
              <select name="role" value={form.role} onChange={handleChange} className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                <option value="tourist">Tourist</option><option value="admin">Admin / Authority</option>
              </select>
              <button type="button" onClick={nextStep} className="w-full py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700">Next — Personal Details</button>
            </>
          )}

          {step === 2 && (
            <>
              <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Personal & Travel Details</h3>
              <div className="grid grid-cols-2 gap-3">
                <input type="text" name="nationality" value={form.nationality} onChange={handleChange} className="px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="Nationality" />
                <input type="text" name="passportNumber" value={form.passportNumber} onChange={handleChange} className="px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="Passport / ID No." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input type="date" name="dateOfBirth" value={form.dateOfBirth} onChange={handleChange} className="px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="Date of Birth" />
                <select name="gender" value={form.gender} onChange={handleChange} className="px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500">
                  <option value="">Gender</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <select name="bloodGroup" value={form.bloodGroup} onChange={handleChange} className="px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500">
                  <option value="">Blood Group</option>
                  {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bg => <option key={bg} value={bg}>{bg}</option>)}
                </select>
                <select name="preferredLanguage" value={form.preferredLanguage} onChange={handleChange} className="px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500">
                  <option value="English">English</option><option value="Hindi">Hindi</option><option value="Telugu">Telugu</option>
                  <option value="Tamil">Tamil</option><option value="Bengali">Bengali</option><option value="Marathi">Marathi</option>
                  <option value="Kannada">Kannada</option><option value="Malayalam">Malayalam</option><option value="Other">Other</option>
                </select>
              </div>
              <input type="text" name="address" value={form.address} onChange={handleChange} className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="Home Address" />
              <input type="text" name="travelPurpose" value={form.travelPurpose} onChange={handleChange} className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="Travel Purpose (Tourism, Business, etc.)" />
              <textarea name="medicalConditions" value={form.medicalConditions} onChange={handleChange} className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="Medical Conditions / Allergies (optional)" rows={2} />
              <div className="flex space-x-3">
                <button type="button" onClick={() => setStep(1)} className="flex-1 py-3 bg-gray-200 text-gray-700 font-bold rounded-lg hover:bg-gray-300">Back</button>
                <button type="button" onClick={nextStep} className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700">Next — Emergency Contact</button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Emergency Contact</h3>
              <p className="text-xs text-gray-400">This person will be contacted in case of an emergency.</p>
              <input type="text" name="emergencyContactName" value={form.emergencyContactName} onChange={handleChange} className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="Emergency Contact Name" />
              <input type="tel" name="emergencyContactPhone" value={form.emergencyContactPhone} onChange={handleChange} className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="Emergency Contact Phone" />
              <select name="emergencyContactRelation" value={form.emergencyContactRelation} onChange={handleChange} className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500">
                <option value="">Relationship</option>
                <option value="parent">Parent</option><option value="spouse">Spouse</option><option value="sibling">Sibling</option>
                <option value="friend">Friend</option><option value="relative">Relative</option><option value="other">Other</option>
              </select>
              <div className="flex space-x-3">
                <button type="button" onClick={() => setStep(2)} className="flex-1 py-3 bg-gray-200 text-gray-700 font-bold rounded-lg hover:bg-gray-300">Back</button>
                <button type="submit" disabled={loading} className="flex-1 py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 disabled:opacity-50">{loading ? 'Creating...' : 'Create Account'}</button>
              </div>
            </>
          )}
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">Have an account? <Link to="/login" className="text-blue-600 font-medium hover:underline">Sign In</Link></p>
      </div>
    </div>
  );
};
export default Register;
