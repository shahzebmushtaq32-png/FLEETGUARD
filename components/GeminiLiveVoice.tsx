
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';

const GeminiLiveVoice: React.FC = () => {
  const [isActive, setIsActive] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sessionRef = useRef<any>(null);

  const toggleVoice = async () => {
    if (isActive) {
        setIsActive(false);
        setIsListening(false);
        if (sessionRef.current) sessionRef.current.close();
        return;
    }

    setIsActive(true);
    setIsListening(true);
    
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        const outNode = audioContextRef.current.createGain();
        outNode.connect(audioContextRef.current.destination);

        const sessionPromise = ai.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-12-2025',
            callbacks: {
                onopen: () => {
                    const source = audioContextRef.current!.createMediaStreamSource(stream);
                    const processor = audioContextRef.current!.createScriptProcessor(4096, 1, 1);
                    processor.onaudioprocess = (e) => {
                        const input = e.inputBuffer.getChannelData(0);
                        const int16 = new Int16Array(input.length);
                        for(let i=0; i<input.length; i++) int16[i] = input[i] * 32768;
                        const base64 = btoa(String.fromCharCode(...new Uint8Array(int16.buffer)));
                        sessionPromise.then(s => s.sendRealtimeInput({ media: { data: base64, mimeType: 'audio/pcm;rate=16000' } }));
                    };
                    source.connect(processor);
                    processor.connect(audioContextRef.current!.destination);
                },
                onmessage: async (msg) => {
                    const audio = msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                    if (audio) {
                        const binary = atob(audio);
                        const bytes = new Uint8Array(binary.length);
                        for (let i=0; i<binary.length; i++) bytes[i] = binary.charCodeAt(i);
                        const int16 = new Int16Array(bytes.buffer);
                        const buffer = audioContextRef.current!.createBuffer(1, int16.length, 24000);
                        const data = buffer.getChannelData(0);
                        for (let i=0; i<int16.length; i++) data[i] = int16[i] / 32768.0;
                        const node = audioContextRef.current!.createBufferSource();
                        node.buffer = buffer;
                        node.connect(outNode);
                        node.start();
                    }
                },
                onerror: () => setIsActive(false),
                onclose: () => setIsActive(false)
            },
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
                systemInstruction: 'You are the BDO Fleet Support Assistant. Help the agent with lead priority, directions, and protocol queries.'
            }
        });

        sessionRef.current = await sessionPromise;
    } catch (e) {
        console.error(e);
        setIsActive(false);
    }
  };

  return (
    <button 
        onClick={toggleVoice}
        className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all shadow-xl ${isActive ? 'bg-white text-blue-600' : 'bg-white/20 text-[#003366]'}`}
    >
        {isActive ? (
            <div className="flex items-center gap-0.5">
                <div className="w-1 h-3 bg-blue-600 rounded-full animate-[bounce_0.6s_infinite]"></div>
                <div className="w-1 h-5 bg-blue-600 rounded-full animate-[bounce_0.8s_infinite]"></div>
                <div className="w-1 h-3 bg-blue-600 rounded-full animate-[bounce_0.6s_infinite]"></div>
            </div>
        ) : (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
        )}
    </button>
  );
};

export default GeminiLiveVoice;
