
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Modality, Blob, LiveServerMessage } from '@google/genai';

// FIX: Added manual encode function as per guidelines
function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// FIX: Added manual decode function as per guidelines
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// FIX: Added decodeAudioData helper to handle raw PCM audio bytes
async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

const GeminiLiveVoice: React.FC = () => {
  const [isActive, setIsActive] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const sessionRef = useRef<any>(null);
  // FIX: nextStartTime cursor to track end of audio playback queue for gapless synchronization
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const toggleVoice = async () => {
    if (isActive) {
        setIsActive(false);
        setIsListening(false);
        if (sessionRef.current) {
          sessionRef.current.close();
          sessionRef.current = null;
        }
        return;
    }

    setIsActive(true);
    setIsListening(true);
    
    try {
        // FIX: Create instance right before making the API call to ensure fresh API key
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // FIX: Separate contexts for input (16kHz) and output (24kHz) as per guidelines
        inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        
        const outputNode = outputAudioContextRef.current.createGain();
        outputNode.connect(outputAudioContextRef.current.destination);

        const sessionPromise = ai.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-12-2025',
            callbacks: {
                onopen: () => {
                    const source = inputAudioContextRef.current!.createMediaStreamSource(stream);
                    const scriptProcessor = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
                    scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                        const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                        
                        // FIX: Proper raw PCM encoding
                        const l = inputData.length;
                        const int16 = new Int16Array(l);
                        for (let i = 0; i < l; i++) {
                          int16[i] = inputData[i] * 32768;
                        }
                        const pcmBlob: Blob = {
                          data: encode(new Uint8Array(int16.buffer)),
                          mimeType: 'audio/pcm;rate=16000',
                        };

                        // FIX: Use sessionPromise.then to ensure session is resolved before sending data
                        sessionPromise.then((session) => {
                          session.sendRealtimeInput({ media: pcmBlob });
                        });
                    };
                    source.connect(scriptProcessor);
                    scriptProcessor.connect(inputAudioContextRef.current!.destination);
                },
                onmessage: async (message: LiveServerMessage) => {
                    const base64EncodedAudioString = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                    
                    if (base64EncodedAudioString) {
                        const outCtx = outputAudioContextRef.current!;
                        
                        // FIX: Scheduled playback at exact end time of previous chunk
                        nextStartTimeRef.current = Math.max(
                          nextStartTimeRef.current,
                          outCtx.currentTime,
                        );

                        const audioBuffer = await decodeAudioData(
                          decode(base64EncodedAudioString),
                          outCtx,
                          24000,
                          1,
                        );

                        const source = outCtx.createBufferSource();
                        source.buffer = audioBuffer;
                        source.connect(outputNode);
                        
                        source.addEventListener('ended', () => {
                          sourcesRef.current.delete(source);
                        });

                        source.start(nextStartTimeRef.current);
                        nextStartTimeRef.current = nextStartTimeRef.current + audioBuffer.duration;
                        sourcesRef.current.add(source);
                    }

                    const interrupted = message.serverContent?.interrupted;
                    if (interrupted) {
                      for (const source of sourcesRef.current.values()) {
                        source.stop();
                        sourcesRef.current.delete(source);
                      }
                      nextStartTimeRef.current = 0;
                    }
                },
                onerror: (e) => {
                  console.error("Gemini Live Error:", e);
                  setIsActive(false);
                },
                onclose: () => setIsActive(false)
            },
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: { 
                  voiceConfig: { 
                    prebuiltVoiceConfig: { voiceName: 'Zephyr' } 
                  } 
                },
                systemInstruction: 'You are the BDO Fleet Support Assistant. Help the agent with lead priority, directions, and protocol queries.'
            }
        });

        sessionRef.current = await sessionPromise;
    } catch (e) {
        console.error("Gemini Live Setup Failed:", e);
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
