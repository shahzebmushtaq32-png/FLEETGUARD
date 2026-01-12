
import React, { useState, useEffect } from 'react';
import { UserRole } from '../types';
import { persistenceService } from '../services/persistenceService';

interface LoginProps {
  onLogin: (username: string, role: UserRole, officerId?: string) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [role, setRole] = useState<UserRole>('BDO');
  const [id, setId] = useState('n1');
  const [password, setPassword] = useState('12345');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Auto-fill credentials when switching tabs
  useEffect(() => {
    setError('');
    if (role === 'BDO') {
      setId('n1');
      setPassword('12345');
    } else {
      setId('admin');
      setPassword('admin');
    }
  }, [role]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (role === 'BDO') {
      setLoading(true);
      
      // 1. Fetch registered officers from persistence service (DB Source)
      const officers = await persistenceService.fetchOfficersAPI();
      
      // 2. Find matching credentials (case-insensitive for ID)
      const officer = officers.find(o => o.id.toLowerCase() === id.toLowerCase() && o.password === password);

      if (officer) {
          // Native App Feature: Simulate JWT Token Generation
          const mockToken = `bdo_jwt_${btoa(officer.id + ':' + Date.now())}`;
          localStorage.setItem('bdo_auth_token', mockToken);
          localStorage.setItem('bdo_user_session', JSON.stringify({
            username: officer.name,
            role: 'BDO',
            officerId: officer.id,
            expiresAt: Date.now() + 3600000 // 1 hour
          }));

          // 3. Login with actual officer details
          onLogin(officer.name, 'BDO', officer.id);
      } else {
        setError('Wrong Credentials. Ask Admin to register you.');
      }
      setLoading(false);
    } else {
      // Admin login check
      if (id.toLowerCase() === 'admin' && password === 'admin') {
        // Native App Feature: Admin Session
        const mockToken = `bdo_admin_jwt_${Date.now()}`;
        localStorage.setItem('bdo_auth_token', mockToken);
        localStorage.setItem('bdo_user_session', JSON.stringify({
          username: 'Administrator',
          role: 'Admin',
          expiresAt: Date.now() + 3600000
        }));

        onLogin('Administrator', 'Admin');
      } else {
        setError('Wrong Admin ID or Password. (Hint: admin / admin)');
      }
    }
  };

  return (
    <div className="h-screen w-full flex items-center justify-center bg-[#003366] p-4">
      <div className="w-full max-w-sm bg-white rounded-[2.5rem] p-10 shadow-2xl">
        <div className="text-center mb-10">
          <div className="w-20 h-20 bg-[#FFD100] rounded-[1.8rem] flex items-center justify-center font-black text-[#003366] text-4xl mx-auto mb-6 shadow-xl">B</div>
          <h1 className="text-2xl font-black text-[#003366] uppercase tracking-tight">BDO Mobile</h1>
          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-2 italic">Official Field Portal</p>
        </div>

        <div className="flex gap-2 p-1.5 bg-slate-100 rounded-2xl mb-8">
           <button 
             onClick={() => setRole('BDO')}
             className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${role === 'BDO' ? 'bg-[#003366] text-white shadow-md' : 'text-slate-400'}`}
           >
             Field Agent
           </button>
           <button 
             onClick={() => setRole('Admin')}
             className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${role === 'Admin' ? 'bg-[#003366] text-white shadow-md' : 'text-slate-400'}`}
           >
             Admin Panel
           </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 ml-1">
              {role === 'BDO' ? 'Agent Code' : 'Admin ID'}
            </label>
            <input 
              type="text" 
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder={role === 'BDO' ? "e.g. n1" : "e.g. admin"}
              className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold focus:border-[#FFD100] outline-none transition-all"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 ml-1">Password</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold focus:border-[#FFD100] outline-none transition-all"
            />
          </div>

          {error && <p className="text-red-500 text-[9px] font-black text-center uppercase tracking-wide">{error}</p>}

          <button 
            disabled={loading}
            className="w-full bg-[#FFD100] text-[#003366] font-black py-5 rounded-2xl uppercase text-[11px] tracking-[0.2em] shadow-lg active:scale-95 transition-all mt-4"
          >
            {loading ? 'Verifying...' : 'Access Portal'}
          </button>
        </form>

        <div className="mt-10 text-center">
          <p className="text-[8px] text-slate-300 font-bold uppercase tracking-[0.3em]">
             Default: {role === 'BDO' ? 'n1 / 12345' : 'admin / admin'}
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
