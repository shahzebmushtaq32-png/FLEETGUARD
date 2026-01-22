import React from 'react';

const GeminiLiveVoice: React.FC = () => {
  const toggleVoice = () => {
    alert("Voice Module Disabled: AI Library removed from configuration.");
  };

  return (
    <button 
        onClick={toggleVoice}
        className="w-12 h-12 rounded-2xl flex items-center justify-center transition-all shadow-xl bg-white/20 text-[#003366] opacity-50 cursor-not-allowed"
        title="Voice Module Disabled"
    >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
    </button>
  );
};

export default GeminiLiveVoice;