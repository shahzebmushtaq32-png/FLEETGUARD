
import React, { useState, useRef, useEffect } from 'react';
import { SalesOfficer, Geofence } from '../types';
import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type } from '@google/genai';

interface GeminiLiveVoiceProps {
  devices: SalesOfficer[];
  onSetGeofence: (fence: Geofence) => void;
}

const GeminiLiveVoice: React.FC<GeminiLiveVoiceProps> = ({ devices, onSetGeofence }) => {
  const [isActive, setIsActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [volume, setVolume] = useState(0);

  // Audio References
  const inputContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const outputNodeRef = useRef<GainNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  // Session State
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // cleanup on unmount
  useEffect(() => {
    return () => stopSession();
  }, []);

  const createPerimeterTool: FunctionDeclaration = {
    name: 'create_perimeter',
    parameters: {
      type: Type.OBJECT,
      description: 'Create a security perimeter or geofence on the map at a specific coordinate.',
      properties: {
        lat: { type: Type.NUMBER, description: 'Latitude of the center' },
        lng: { type: Type.NUMBER, description: 'Longitude of the center' },
        radius: { type: Type.NUMBER, description: 'Radius in meters' },
        label: { type: Type.STRING, description: 'Label for the perimeter (e.g., "Secure Zone Alpha")' }
      },
      required: ['lat', 'lng', 'radius', 'label']
    }
  };

  const startSession = async () => {
    setIsConnecting(true);
    try {
      // 1. Audio Setup
      inputContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outputContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      outputNodeRef.current = outputContextRef.current.createGain();
      outputNodeRef.current.connect(outputContextRef.current.destination);

      // 2. Connect to Gemini Live
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
          systemInstruction: `You are the BDO Fleet Command AI. 
            Your role is to assist the field officer with tactical advice.
            Current Fleet Status: ${devices.length} active officers.
            You can create perimeters on the map if requested.
            Keep responses concise, professional, and military-style.`,
          tools: [{ functionDeclarations: [createPerimeterTool] }]
        },
        callbacks: {
          onopen: () => {
             console.log("Gemini Live Connected");
             setIsConnecting(false);
             setIsActive(true);
             
             // Start Audio Streaming
             const ctx = inputContextRef.current!;
             const source = ctx.createMediaStreamSource(stream);
             const processor = ctx.createScriptProcessor(4096, 1, 1);
             
             processor.onaudioprocess = (e) => {
               const inputData = e.inputBuffer.getChannelData(0);
               
               // Simple Volume Meter
               let sum = 0;
               for(let i=0; i<inputData.length; i++) sum += inputData[i] * inputData[i];
               setVolume(Math.sqrt(sum / inputData.length) * 100);

               const pcmBlob = createPcmBlob(inputData);
               sessionPromise.then(session => {
                 session.sendRealtimeInput({ media: pcmBlob });
               });
             };

             source.connect(processor);
             processor.connect(ctx.destination);
             
             sourceNodeRef.current = source;
             processorRef.current = processor;
          },
          onmessage: async (msg: LiveServerMessage) => {
            // Handle Tool Calls (Geofence)
            if (msg.toolCall) {
              for (const fc of msg.toolCall.functionCalls) {
                if (fc.name === 'create_perimeter') {
                  const fence: Geofence = {
                    id: `geo-${Date.now()}`,
                    lat: fc.args.lat as number,
                    lng: fc.args.lng as number,
                    radius: fc.args.radius as number,
                    label: fc.args.label as string
                  };
                  onSetGeofence(fence);
                  
                  // Send Success Response
                  sessionPromise.then(s => s.sendToolResponse({
                    functionResponses: {
                      id: fc.id,
                      name: fc.name,
                      response: { result: "Perimeter established successfully." }
                    }
                  }));
                }
              }
            }

            // Handle Audio Output
            const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData) {
              playAudioChunk(audioData);
            }
          },
          onclose: () => stopSession(),
          onerror: (err) => {
            console.error("Gemini Live Error:", err);
            stopSession();
          }
        }
      });
      sessionPromiseRef.current = sessionPromise;

    } catch (e) {
      console.error("Failed to start session", e);
      setIsConnecting(false);
      stopSession();
    }
  };

  const stopSession = () => {
    setIsActive(false);
    setIsConnecting(false);
    setVolume(0);

    // Stop Mic Stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    // Disconnect Audio Nodes
    if (sourceNodeRef.current) sourceNodeRef.current.disconnect();
    if (processorRef.current) processorRef.current.disconnect();
    if (inputContextRef.current) inputContextRef.current.close();
    if (outputContextRef.current) outputContextRef.current.close();
    
    // Close Session (if method exists or just let it timeout/disconnect)
    sessionPromiseRef.current = null;
  };

  // --- Audio Helpers ---

  const createPcmBlob = (data: Float32Array) => {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      int16[i] = data[i] * 32768;
    }
    // Simple Base64 encode for PCM data
    let binary = '';
    const bytes = new Uint8Array(int16.buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
    
    return {
      data: btoa(binary),
      mimeType: 'audio/pcm;rate=16000'
    };
  };

  const playAudioChunk = async (base64Data: string) => {
     if (!outputContextRef.current || !outputNodeRef.current) return;
     const ctx = outputContextRef.current;
     
     // Base64 Decode
     const binaryString = atob(base64Data);
     const len = binaryString.length;
     const bytes = new Uint8Array(len);
     for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
     
     // Convert Int16 PCM to AudioBuffer
     const dataInt16 = new Int16Array(bytes.buffer);
     const buffer = ctx.createBuffer(1, dataInt16.length, 24000);
     const channelData = buffer.getChannelData(0);
     for (let i = 0; i < dataInt16.length; i++) {
        channelData[i] = dataInt16[i] / 32768.0;
     }

     // Play Queue
     nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
     const source = ctx.createBufferSource();
     source.buffer = buffer;
     source.connect(outputNodeRef.current);
     source.start(nextStartTimeRef.current);
     nextStartTimeRef.current += buffer.duration;
     
     sourcesRef.current.add(source);
     source.onended = () => sourcesRef.current.delete(source);
  };

  const toggleSession = () => {
    if (isActive) stopSession();
    else startSession();
  };

  return (
    <div className="flex items-center gap-2">
      {isActive && (
        <div className="flex gap-0.5 items-end h-4 mr-2">
           <div className="w-1 bg-[#FFD100] rounded-full transition-all duration-75" style={{ height: `${Math.max(20, volume * 2)}%` }}></div>
           <div className="w-1 bg-[#FFD100] rounded-full transition-all duration-75 delay-75" style={{ height: `${Math.max(20, volume * 1.5)}%` }}></div>
           <div className="w-1 bg-[#FFD100] rounded-full transition-all duration-75 delay-100" style={{ height: `${Math.max(20, volume)}%` }}></div>
        </div>
      )}
      
      <button 
        onClick={toggleSession} 
        disabled={isConnecting} 
        className={`p-2 rounded-full transition-all flex items-center gap-2 relative overflow-hidden ${
          isActive 
            ? 'bg-red-600 text-white shadow-[0_0_15px_rgba(220,38,38,0.5)] border border-red-400' 
            : 'bg-[#002855] text-[#FFD100] border border-[#FFD100]/30 hover:bg-[#003D7C]'
        }`}
      >
        {isActive && <div className="absolute inset-0 bg-red-500 animate-ping opacity-20 rounded-full"></div>}
        
        {isConnecting ? (
          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
        ) : (
          <svg className={`w-5 h-5 ${isActive ? 'animate-pulse' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        )}
        {isActive && <span className="text-[10px] font-bold uppercase tracking-wider mr-1">Listening...</span>}
      </button>
    </div>
  );
};

export default GeminiLiveVoice;
