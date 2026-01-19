import React, { useState, useEffect } from 'react';
import { UserRole } from '../types';
import { persistenceService } from '../services/persistenceService';

interface LoginProps {
  onLogin: (username: string, role: UserRole, officerId?: string) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [role, setRole] = useState<UserRole>('BDO');
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isWakingUp, setIsWakingUp] = useState(false);

  useEffect(() => {
    setError('');
    if (role === 'Admin') {
      setId('admin');
    } else {
        setId('');
    }
  }, [role]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !password) {
      setError("Please provide all credentials.");
      return;
    }
    
    setError('');
    setLoading(true);
    setIsWakingUp(false);

    const timer = setTimeout(() => {
        if (loading) setIsWakingUp(true);
    }, 4000);

    try {
        const response = await persistenceService.login(id, password);
        const { token, user } = response;

        if (role === 'Admin' && user.role !== 'Admin') {
            throw new Error("Access Denied: Administrative Clearance Required.");
        }

        localStorage.setItem('bdo_auth_token', token);
        localStorage.setItem('bdo_user_session', JSON.stringify({
            username: user.name,
            role: user.role,
            officerId: user.id,
            expiresAt: Date.now() + (12 * 60 * 60 * 1000)
        }));

        onLogin(user.name, user.role, user.id);

    } catch (err: any) {
        console.error("Login Error:", err);
        setError(err.message || "Uplink Failure: Connection Timeout");
    } finally {
        clearTimeout(timer);
        setLoading(false);
        setIsWakingUp(false);
    }
  };

  return (
    <div className="h-screen w-full flex items-center justify-center bg-gradient-to-b from-[#003366] to-[#001D3D] p-6">
      <div className="w-full max-w-sm bg-white rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden transition-all duration-500">
        <div className="absolute top-0 left-0 w-full h-2 bg-[#FFD100]"></div>

        <div className="text-center mb-8 mt-4">
          <div className="w-24 h-24 bg-white rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-lg border-4 border-slate-50 relative group">
            <div className="absolute inset-0 bg-[#FFD100] rounded-2xl opacity-10 group-hover:scale-110 transition-transform"></div>
            <div className="w-16 h-16 bg-[#FFD100] rounded-2xl flex items-center justify-center font-black text-[#003366] text-4xl shadow-sm z-10">
                B
            </div>
          </div>
          <h1 className="text-2xl font-black text-[#003366] uppercase tracking-tight">BDO Mobile</h1>
          <p className="text-[#003366] text-[10px] font-bold uppercase tracking-[0.3em] mt-1 opacity-60">Fleet Tracking System</p>
        </div>

        <div className="flex gap-2 p-1.5 bg-slate-100 rounded-2xl mb-8 border border-slate-200">
           <button 
             type="button"
             onClick={() => setRole('BDO')}
             className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${role === 'BDO' ? 'bg-[#003366] text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
           >
             Field Agent
           </button>
           <button 
             type="button"
             onClick={() => setRole('Admin')}
             className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${role === 'Admin' ? 'bg-[#003366] text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
           >
             Admin
           </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 ml-1">
              {role === 'BDO' ? 'Agent ID' : 'Admin ID'}
            </label>
            <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                </div>
                <input 
                type="text" 
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder={role === 'BDO' ? "e.g. n1" : "admin"}
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl pl-12 pr-4 py-4 text-sm font-bold text-[#003366] focus:border-[#FFD100] outline-none transition-all placeholder:text-slate-300"
                autoComplete="username"
                />
            </div>
          </div>

          <div>
            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 ml-1">Access Key</label>
             <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                </div>
                <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl pl-12 pr-4 py-4 text-sm font-bold text-[#003366] focus:border-[#FFD100] outline-none transition-all placeholder:text-slate-300"
                autoComplete="current-password"
                />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-500 bg-red-50 p-3 rounded-xl border border-red-100 animate-in fade-in zoom-in duration-200">
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <p className="text-[9px] font-black uppercase tracking-wide">{error}</p>
            </div>
          )}

          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-[#FFD100] hover:bg-[#ffdb4d] text-[#003366] font-black py-5 rounded-2xl uppercase text-[11px] tracking-[0.2em] shadow-lg shadow-orange-200/50 active:scale-95 transition-all mt-6 disabled:opacity-50 disabled:active:scale-100"
          >
            {loading ? (
                <span className="flex flex-col items-center justify-center gap-1">
                    <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-[#003366] border-t-transparent rounded-full animate-spin"></span>
                        Synchronizing...
                    </span>
                    {isWakingUp && <span className="text-[7px] animate-pulse">Establishing Secure Uplink...</span>}
                </span>
            ) : 'Access Secure Grid'}
          </button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-[8px] text-slate-400 font-bold uppercase tracking-[0.3em] mb-1">
             FleetGuard IoT V3.0 Stable
          </p>
          <p className="text-[8px] text-slate-300 font-bold uppercase tracking-[0.1em]">
             Encrypted BDO Infrastructure
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;