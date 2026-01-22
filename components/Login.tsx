import React, { useState, useEffect } from 'react';
import { UserRole } from '../types.ts';
import { persistenceService } from '../services/persistenceService.ts';

interface LoginProps {
  onLogin: (username: string, role: UserRole, officerId?: string) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [role, setRole] = useState<UserRole>('BDO');
  const [id, setId] = useState('n1');
  const [password, setPassword] = useState('123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isWakingUp, setIsWakingUp] = useState(false);

  useEffect(() => {
    setError('');
    // Smart auto-fill logic for demo purposes
    if (role === 'Admin') {
      if (id === 'n1') setId('admin');
    } else {
      if (id === 'admin') setId('n1');
    }
  }, [role]);

  const useDemoCredentials = () => {
      setRole('BDO');
      setId('n1');
      setPassword('123');
      setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !password) {
      setError("Please provide all credentials.");
      return;
    }
    
    setError('');
    setLoading(true);
    setIsWakingUp(false);

    // UX: Show "Establishing Link" if it takes a moment (waking up free-tier backend)
    const timer = setTimeout(() => {
        if (loading) setIsWakingUp(true);
    }, 2000);

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
        setError(err.message || "Connection Failed. Try again.");
    } finally {
        clearTimeout(timer);
        setLoading(false);
        setIsWakingUp(false);
    }
  };

  return (
    <div className="h-screen w-full flex items-center justify-center bg-[#003366] p-6 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-[#004b93] rounded-bl-full opacity-50"></div>
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-[#FFD100] rounded-tr-full opacity-10"></div>

      <div className="w-full max-w-sm bg-white rounded-[2rem] p-8 shadow-2xl relative z-10 animate-in fade-in zoom-in duration-300">
        
        <div className="text-center mb-8 mt-2">
          <div className="w-20 h-20 bg-[#003366] rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-900/20">
             <span className="text-[#FFD100] font-black text-4xl tracking-tighter">BDO</span>
          </div>
          <h1 className="text-xl font-black text-[#003366] uppercase tracking-tight">Enterprise Access</h1>
          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.2em] mt-1">Mobile Secure Gateway</p>
        </div>

        <div className="flex gap-2 p-1 bg-slate-100 rounded-xl mb-6">
           <button 
             type="button"
             onClick={() => setRole('BDO')}
             className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${role === 'BDO' ? 'bg-[#003366] text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
           >
             Agent
           </button>
           <button 
             type="button"
             onClick={() => setRole('Admin')}
             className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${role === 'Admin' ? 'bg-[#003366] text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
           >
             Dispatch
           </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
              {role === 'BDO' ? 'Officer ID' : 'Admin ID'}
            </label>
            <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#003366] transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                </div>
                <input 
                type="text" 
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder={role === 'BDO' ? "e.g. n1" : "admin"}
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl pl-12 pr-4 py-3.5 text-sm font-bold text-[#003366] focus:border-[#FFD100] outline-none transition-all placeholder:text-slate-300"
                />
            </div>
          </div>

          <div>
            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Secure PIN</label>
             <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#003366] transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                </div>
                <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl pl-12 pr-4 py-3.5 text-sm font-bold text-[#003366] focus:border-[#FFD100] outline-none transition-all placeholder:text-slate-300"
                />
            </div>
          </div>

          {error && (
            <div className="flex flex-col gap-2 text-red-600 bg-red-50 p-3 rounded-xl border border-red-100 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <p className="text-[10px] font-bold uppercase tracking-wide leading-tight flex-1">{error}</p>
                </div>
                {/* Fallback Action */}
                <button 
                    type="button" 
                    onClick={useDemoCredentials} 
                    className="text-[9px] font-black underline text-red-500 hover:text-red-700 text-left uppercase pl-6"
                >
                    Reset to Demo Defaults
                </button>
            </div>
          )}

          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-[#FFD100] hover:bg-[#ffdb4d] text-[#003366] font-black py-4 rounded-xl uppercase text-xs tracking-[0.2em] shadow-lg shadow-yellow-500/20 active:scale-95 transition-all mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
                <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-[#003366] border-t-transparent rounded-full animate-spin"></div>
                    <span>{isWakingUp ? 'Connecting...' : 'Verifying...'}</span>
                </div>
            ) : 'Authenticate'}
          </button>
        </form>

        <div className="mt-8 text-center border-t border-slate-100 pt-6">
          <p className="text-[8px] text-slate-400 font-bold uppercase tracking-[0.3em]">
             Authorized Personnel Only
          </p>
          <div className="flex justify-center gap-2 mt-2 opacity-50">
             <div className="w-1 h-1 rounded-full bg-[#003366]"></div>
             <div className="w-1 h-1 rounded-full bg-[#003366]"></div>
             <div className="w-1 h-1 rounded-full bg-[#003366]"></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;