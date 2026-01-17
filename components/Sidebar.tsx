
import React, { useState } from 'react';
import { SalesOfficer } from '../types';

interface SidebarProps {
  devices: SalesOfficer[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ devices, selectedId, onSelect }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = devices.filter(d => 
    d.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    d.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-[#0f172a]">
      {/* Search Area */}
      <div className="p-4 border-b border-white/5">
        <div className="relative">
            <input 
                type="text" 
                placeholder="Search Field Nodes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[#1e293b] border border-white/10 rounded-xl py-3 pl-10 pr-4 text-xs font-bold text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 transition-all uppercase tracking-wide"
            />
            <svg className="w-4 h-4 text-slate-600 absolute left-3 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        </div>
      </div>

      {/* Header */}
      <div className="flex justify-between items-center px-6 py-4">
         <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Grid Personnel</h3>
         <span className="text-[9px] font-mono bg-cyan-500/10 text-cyan-400 px-2 py-0.5 rounded border border-cyan-500/20">{filtered.length} NODES</span>
      </div>
      
      {/* List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pb-4 space-y-2">
          {filtered.length === 0 && (
              <div className="py-8 text-center opacity-50">
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">No active nodes</p>
              </div>
          )}

          {filtered.map(off => {
             const isSelected = selectedId === off.id;
             const statusColor = off.status === 'Active' ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' : 
                                 off.status === 'Break' ? 'text-amber-400 bg-amber-400/10 border-amber-400/20' : 
                                 'text-slate-400 bg-slate-400/10 border-slate-400/20';
             
             // Detect if using Native App Background Service
             const isNative = off.telemetrySource && off.telemetrySource.includes('ANDROID');

             return (
                 <button 
                    key={off.id}
                    onClick={() => onSelect(off.id)}
                    className={`w-full group relative overflow-hidden rounded-xl border transition-all duration-200 text-left p-3 ${
                        isSelected 
                        ? 'bg-[#1e293b] border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.1)]' 
                        : 'bg-[#1e293b]/50 border-white/5 hover:bg-[#1e293b] hover:border-white/10'
                    }`}
                 >
                    {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-cyan-500"></div>}
                    
                    <div className="flex items-center gap-3 mb-3">
                        {/* Avatar */}
                        <div className="relative">
                             {/* BUST CACHE: Key helps React identify when URL changed and forces reload */}
                             <img key={off.avatar} src={off.avatar || 'https://via.placeholder.com/40'} className={`w-10 h-10 rounded-lg object-cover grayscale group-hover:grayscale-0 transition-all ${isSelected ? 'grayscale-0' : ''}`} />
                             <div className={`absolute -bottom-1 -right-1 w-2.5 h-2.5 rounded-full border border-[#1e293b] ${off.status === 'Offline' ? 'bg-slate-600' : 'bg-emerald-500'}`}></div>
                        </div>

                        {/* Name & ID */}
                        <div className="flex-1 min-w-0">
                            <h4 className="text-xs font-black text-white uppercase tracking-tight truncate">{off.name}</h4>
                            <div className="flex items-center gap-2 mt-0.5">
                                {isNative ? (
                                    <svg className="w-3 h-3 text-emerald-400" fill="currentColor" viewBox="0 0 24 24"><title>Native Android Background Service</title><path d="M17.523 15.3414C17.523 15.3414 17.5644 15.3414 17.5644 15.3414C17.5644 15.3414 17.6059 15.3414 17.5644 15.3414C17.5644 15.3414 17.523 15.3414 17.523 15.3414ZM6.47696 15.3414C6.47696 15.3414 6.43542 15.3414 6.43542 15.3414C6.43542 15.3414 6.47696 15.3414 6.47696 15.3414C6.47696 15.3414 6.51849 15.3414 6.47696 15.3414ZM16.6343 11.2355C16.6343 11.2355 16.6343 11.2355 16.6343 11.2355L18.7731 7.52989C18.877 7.34718 18.8146 7.10636 18.6319 7.00255C18.4492 6.89874 18.2084 6.96102 18.1046 7.14373L15.9284 10.9158C14.7406 10.3718 13.4116 10.0562 12 10.0562C10.5884 10.0562 9.2594 10.3718 8.0716 10.9158L5.89542 7.14373C5.79161 6.96102 5.55079 6.89874 5.36809 7.00255C5.18538 7.10636 5.1231 7.34718 5.22691 7.52989L7.36569 11.2355C7.36569 11.2355 7.36569 11.2355 7.36569 11.2355C3.3375 12.3982 0.389648 15.8438 0.389648 20.0001H23.6104C23.6104 15.8438 20.6625 12.3982 16.6343 11.2355ZM6.47696 16.9234C5.97858 16.9234 5.58406 16.5289 5.58406 16.0305C5.58406 15.5322 5.97858 15.1376 6.47696 15.1376C6.97534 15.1376 7.36987 15.5322 7.36987 16.0305C7.36987 16.5289 6.97534 16.9234 6.47696 16.9234ZM17.523 16.9234C17.0247 16.9234 16.6301 16.5289 16.6301 16.0305C16.6301 15.5322 17.0247 15.1376 17.523 15.1376C18.0214 15.1376 18.4159 15.5322 18.4159 16.0305C18.4159 16.5289 18.0214 16.9234 17.523 16.9234Z" /></svg>
                                ) : (
                                    <svg className="w-3 h-3 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>
                                )}
                                <span className="text-[9px] font-mono text-slate-500 uppercase">{off.id}</span>
                            </div>
                        </div>

                        {/* Status Badge */}
                        <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border ${statusColor}`}>
                            {off.status === 'On Duty' ? 'DUTY' : off.status}
                        </span>
                    </div>

                    {/* Footer Metrics */}
                    <div className="flex items-center justify-between pt-2 border-t border-white/5">
                        <div className="flex items-center gap-3">
                             {/* Source Label */}
                             <span className={`text-[8px] font-mono font-bold ${isNative ? 'text-emerald-400' : 'text-slate-600'}`}>
                                {isNative ? 'APP BG' : 'WEB'}
                             </span>

                             {/* Battery */}
                             <span className={`text-[8px] font-mono font-bold ${off.battery < 20 ? 'text-red-500' : 'text-slate-400'}`}>
                                {off.battery}%
                             </span>
                        </div>
                        <span className="text-[8px] font-mono text-slate-600">
                             {off.status === 'Offline' ? 'OFFLINE' : 'ONLINE'}
                        </span>
                    </div>
                 </button>
             );
          })}
      </div>
    </div>
  );
};

export default Sidebar;
