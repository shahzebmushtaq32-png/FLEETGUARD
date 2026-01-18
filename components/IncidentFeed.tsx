
import React from 'react';
import { Incident } from '../types';

interface IncidentFeedProps {
  incidents: Incident[];
}

const IncidentFeed: React.FC<IncidentFeedProps> = ({ incidents }) => {
  if (incidents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-slate-600 grayscale opacity-40">
        <svg className="w-20 h-20 mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-xs font-black uppercase tracking-[0.3em]">Perimeter Secure</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24">
      {incidents.map((incident) => (
        <div 
          key={incident.id} 
          className={`relative overflow-hidden bg-[#002855] border border-[#003D7C] p-5 rounded-2xl transition-all shadow-xl animate-in slide-in-from-right-8 ${
            incident.title.includes('Breach') ? 'shadow-red-900/10 border-red-500/50' : ''
          }`}
        >
          {incident.title.includes('Breach') && (
            <div className="absolute top-0 right-0 w-16 h-16 bg-red-500/10 rounded-full -mr-8 -mt-8 blur-2xl"></div>
          )}
          
          <div className="flex justify-between items-start mb-2">
            <h4 className="font-black text-sm text-white tracking-tight uppercase flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${incident.severity === 'critical' ? 'bg-red-500 animate-pulse' : 'bg-yellow-500'}`}></span>
              {incident.title}
            </h4>
            <span className="text-[10px] font-mono font-bold text-slate-500 bg-[#001D3D] px-2 py-0.5 rounded">
              {/* PROTECTIVE: Wrap incident.time in new Date() to ensure stability */}
              {new Date(incident.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
          <p className="text-xs text-slate-400 font-medium leading-relaxed">{incident.desc}</p>
          
          <div className="mt-4 flex gap-2">
            <button className="flex-1 py-2 bg-red-600 hover:bg-red-500 text-white text-[9px] font-black uppercase tracking-widest rounded-lg transition-all shadow-lg shadow-red-900/20">
              Initiate Response
            </button>
            <button className="px-4 py-2 bg-[#003D7C] hover:bg-[#004A8C] text-slate-300 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all">
              Acknowledge
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default IncidentFeed;
