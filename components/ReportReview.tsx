
import React from 'react';
import { InteractionReport, SalesOfficer, SalesLead } from '../types';

interface ReportReviewProps {
  reports: InteractionReport[];
  officers: SalesOfficer[];
  leads: SalesLead[];
  onAction: (id: string, status: 'Approved' | 'Rejected') => void;
}

const ReportReview: React.FC<ReportReviewProps> = ({ reports, officers, leads, onAction }) => {
  const pendingReports = reports.filter(r => r.status === 'Submitted');

  if (pendingReports.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-32 text-slate-400 grayscale opacity-40">
        <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        <p className="text-[10px] font-black uppercase tracking-widest">No reports awaiting review</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-4 pb-12">
      {pendingReports.map(report => {
        const officer = officers.find(o => o.id === report.officerId);
        const lead = leads.find(l => l.id === report.leadId);
        
        return (
          <div key={report.id} className="bg-slate-50 border border-slate-200 rounded-3xl p-6 shadow-sm hover:shadow-md transition-all group">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h4 className="text-[10px] font-black text-blue-600 uppercase mb-1">{lead?.clientName || 'Unknown Lead'}</h4>
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Logged by: {officer?.name}</p>
              </div>
              <div className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${
                report.riskLevel === 'Low' ? 'bg-green-100 text-green-700' :
                report.riskLevel === 'Medium' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
              }`}>
                {report.riskLevel} Risk
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-100 mb-4">
               <p className="text-[9px] font-black text-slate-400 uppercase mb-2 tracking-widest">AI Synthesis Brief</p>
               <div className="text-[10px] text-slate-700 leading-relaxed font-medium">
                  {report.expandedContent.substring(0, 300)}...
               </div>
            </div>

            <div className="bg-blue-900/5 p-3 rounded-xl border border-blue-900/10 mb-5">
               <p className="text-[8px] font-black text-blue-900/50 uppercase mb-1">Sentiment Scan</p>
               <p className="text-[9px] italic text-blue-900/80">"{report.sentiment}"</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
               <button onClick={() => onAction(report.id, 'Rejected')} className="py-2.5 bg-white border border-red-100 text-red-500 font-black rounded-xl text-[9px] uppercase tracking-widest hover:bg-red-50 transition-all">Reject Draft</button>
               <button onClick={() => onAction(report.id, 'Approved')} className="py-2.5 bg-[#003366] text-white font-black rounded-xl text-[9px] uppercase tracking-widest shadow-lg active:scale-95 transition-all">Authorize Brief</button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ReportReview;
