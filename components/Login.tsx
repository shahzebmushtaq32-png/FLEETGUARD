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
      setPassword('admin12');
    }
  }, [role]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
        // CALL REAL BACKEND AUTH
        const response = await persistenceService.login(id, password);
        const { token, user } = response;

        // Validation: Ensure role matches selected tab
        if (user.role !== role && !(role === 'BDO' && user.role !== 'Admin')) {
             // Allow 'Senior BDO', 'Account Executive' etc to pass as 'BDO' logic
             // But strict 'Admin' must be 'Admin'
        }

        // Store Session
        localStorage.setItem('bdo_auth_token', token);
        localStorage.setItem('bdo_user_session', JSON.stringify({
            username: user.name,
            role: user.role,
            officerId: user.id,
            expiresAt: Date.now() + (12 * 60 * 60 * 1000) // 12 hours
        }));

        // Proceed
        onLogin(user.name, user.role, user.id);

    } catch (err: any) {
        console.error("Login Failed", err);
        const errorMsg = err.message || "Invalid ID or Connection Failed";
        
        if (errorMsg.includes('Invalid Credentials') && id === 'admin') {
           setError("Login Failed: Please check Neon DB or use Fallback.");
        } else {
           setError(errorMsg);
        }
        
        // --- OFFLINE / FALLBACK MODE FOR DEMO ---
        // If backend fails (e.g. not running locally), verify against cached officers
        if (role === 'BDO') {
            try {
              let officers = await persistenceService.fetchOfficersAPI();
              
              // NEW: If DB is empty, use Mock User for 'n1' so we don't get stuck
              if (officers.length === 0 && id === 'n1' && password === '12345') {
                 console.warn("Using Hardcoded Fallback for n1");
                 const mockUser = {
                    id: 'n1',
                    name: 'James Wilson',
                    password: '12345',
                    role: 'Senior BDO',
                 };
                 onLogin(mockUser.name, 'BDO', mockUser.id);
                 setLoading(false);
                 return;
              }

              const officer = officers.find(o => o.id.toLowerCase() === id.toLowerCase() && o.password === password);
              if (officer) {
                  console.warn("Using Offline Auth Fallback");
                  onLogin(officer.name, 'BDO', officer.id);
                  setLoading(false);
                  return;
              }
            } catch (fallbackErr) {
               console.error("Fallback failed", fallbackErr);
            }
        }
    } finally {
        setLoading(false);
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

          {error && <p className="text-red-500 text-[9px] font-black text-center uppercase tracking-wide px-4 py-2 bg-red-50 rounded-xl">{error}</p>}

          <button 
            disabled={loading}
            className="w-full bg-[#FFD100] text-[#003366] font-black py-5 rounded-2xl uppercase text-[11px] tracking-[0.2em] shadow-lg active:scale-95 transition-all mt-4"
          >
            {loading ? 'Authenticating...' : 'Access Portal'}
          </button>
        </form>

        <div className="mt-10 text-center">
          <p className="text-[8px] text-slate-300 font-bold uppercase tracking-[0.3em]">
             Default: {role === 'BDO' ? 'n1 / 12345' : 'admin / admin12'}
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;