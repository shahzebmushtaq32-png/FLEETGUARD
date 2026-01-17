
import React, { useEffect, useRef, useState } from 'react';
import { SalesOfficer } from '../types';

declare const L: any;

interface MapComponentProps {
  devices: SalesOfficer[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  geofences?: any[];
}

const MapComponent: React.FC<MapComponentProps> = ({ devices, selectedId, onSelect, geofences = [] }) => {
  const mapRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<{ [key: string]: any }>({});
  const historyLayersRef = useRef<{ [key: string]: any }>({});
  const tileLayerRef = useRef<any>(null);
  const trafficLayerRef = useRef<any>(null);
  
  const [mapStyle, setMapStyle] = useState<'light' | 'dark' | 'satellite'>('light');

  // Initialization Hook
  useEffect(() => {
    if (typeof L !== 'undefined') {
      initMap();
      return;
    }

    const script = document.createElement('script');
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = () => initMap();
    document.head.appendChild(script);
  }, []);

  const initMap = () => {
    if (!containerRef.current || mapRef.current) return;
    
    const map = L.map(containerRef.current, { 
      zoomControl: false, 
      attributionControl: false,
      preferCanvas: true,
      fadeAnimation: true,
      zoomAnimation: true
    }).setView([14.5547, 121.0244], 14);

    // 1. Base Tile Layer
    const layer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { 
      maxZoom: 19,
      subdomains: 'abcd'
    }).addTo(map);
    
    tileLayerRef.current = layer;

    // 2. Google Traffic Overlay (Tactical Utility)
    const traffic = L.tileLayer('https://mt0.google.com/vt?lyrs=traffic&x={x}&y={y}&z={z}', {
      maxZoom: 19,
      opacity: 0.6
    }).addTo(map);
    
    trafficLayerRef.current = traffic;
    mapRef.current = map;
  };

  // Tactical Style Switcher
  const cycleMapStyle = () => {
     if (!tileLayerRef.current) return;
     
     let nextStyle: 'light' | 'dark' | 'satellite' = 'light';
     let url = '';
     
     if (mapStyle === 'light') {
         nextStyle = 'dark';
         url = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
     } else if (mapStyle === 'dark') {
         nextStyle = 'satellite';
         url = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
     } else {
         nextStyle = 'light';
         url = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
     }
     
     tileLayerRef.current.setUrl(url);
     setMapStyle(nextStyle);
  };

  // Re-center on all active units
  const fitFleet = () => {
    if (!mapRef.current || devices.length === 0) return;
    const group = L.featureGroup(Object.values(markersRef.current));
    mapRef.current.fitBounds(group.getBounds(), { padding: [50, 50] });
  };

  // Sync Markers and History Trails
  useEffect(() => {
    if (!mapRef.current || typeof L === 'undefined') return;

    devices.forEach(device => {
      if (!device || device.lat === undefined || device.lng === undefined) return;

      const isSelected = device.id === selectedId;
      const lat = parseFloat(String(device.lat));
      const lng = parseFloat(String(device.lng));

      if (isNaN(lat) || isNaN(lng)) return;

      // Status-Based Tactical Color Scheme
      const color = 
        device.status === 'Active' || device.status === 'On Duty' ? '#10b981' : 
        device.status === 'Meeting' ? '#06b6d4' : 
        device.status === 'Break' ? '#f59e0b' : 
        '#64748b';

      const zIndex = isSelected ? 1000 : 100;
      
      // Advanced Unit Marker HTML
      const iconHtml = `
        <div class="relative flex flex-col items-center justify-center transition-all duration-500" style="transform: ${isSelected ? 'scale(1.15)' : 'scale(1)'}">
          
          ${isSelected ? `
             <div class="absolute w-24 h-24 rounded-full animate-ping opacity-20" style="background: ${color}"></div>
             <div class="absolute w-14 h-14 rounded-full border-2 border-dashed opacity-40 animate-spin-slow" style="border-color: ${color}"></div>
          ` : ''}

          <!-- Tactical Chassis -->
          <div class="w-11 h-11 rounded-2xl overflow-hidden bg-slate-900 border-2 relative shadow-2xl transition-colors duration-300" style="border-color: ${isSelected ? '#FFD100' : color}">
             <img src="${device.avatar || 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?w=100&h=100&fit=crop'}" class="w-full h-full object-cover ${device.status === 'Offline' ? 'grayscale' : ''}" />
             
             <!-- Signal Indicator Overlay -->
             <div class="absolute bottom-0 left-0 right-0 h-1 bg-black/40">
                <div class="h-full bg-cyan-400" style="width: ${device.signalStrength}%"></div>
             </div>
          </div>

          <!-- Unit ID Label -->
          <div class="absolute -bottom-7 bg-slate-900/90 text-white text-[8px] font-black uppercase tracking-[0.15em] px-2.5 py-1 rounded-md border border-white/10 whitespace-nowrap backdrop-blur-md shadow-2xl">
            ${device.name || 'UNIDENTIFIED'}
          </div>

          <!-- Pulse Status Orb -->
          <div class="absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-slate-900 shadow-lg ${device.status !== 'Offline' ? 'animate-pulse' : ''}" style="background: ${color}"></div>
        </div>
      `;

      const markerIcon = L.divIcon({ 
        className: 'tactical-marker', 
        html: iconHtml, 
        iconSize: [44, 44], 
        iconAnchor: [22, 22] 
      });

      if (markersRef.current[device.id]) {
        markersRef.current[device.id].setLatLng([lat, lng]);
        markersRef.current[device.id].setZIndexOffset(zIndex);
        markersRef.current[device.id].setIcon(markerIcon);
      } else {
        markersRef.current[device.id] = L.marker([lat, lng], {
          icon: markerIcon,
          zIndexOffset: zIndex
        }).addTo(mapRef.current).on('click', () => onSelect(device.id));
      }

      // Render Breadcrumb Path for Selected Unit
      if (historyLayersRef.current[device.id]) {
          mapRef.current.removeLayer(historyLayersRef.current[device.id]);
      }
      
      if (isSelected && Array.isArray(device.history) && device.history.length > 0) {
          const validHistory = device.history
            .filter(h => h && typeof h.lat === 'number' && typeof h.lng === 'number')
            .map(h => [h.lat, h.lng]);
            
          if (validHistory.length > 0) {
            const path = [...validHistory, [lat, lng]];
            historyLayersRef.current[device.id] = L.polyline(path, {
                color: '#06b6d4',
                weight: 2, 
                opacity: 0.6, 
                dashArray: '5, 10',
                lineJoin: 'round'
            }).addTo(mapRef.current);
          }
      }
    });

    // Cleanup markers for removed devices
    const currentIds = new Set(devices.map(d => d.id));
    Object.keys(markersRef.current).forEach(id => {
        if (!currentIds.has(id)) {
            mapRef.current.removeLayer(markersRef.current[id]);
            delete markersRef.current[id];
            if (historyLayersRef.current[id]) {
                mapRef.current.removeLayer(historyLayersRef.current[id]);
                delete historyLayersRef.current[id];
            }
        }
    });

    if (selectedId && markersRef.current[selectedId]) {
      mapRef.current.panTo(markersRef.current[selectedId].getLatLng(), { animate: true, duration: 0.8 });
    }
  }, [devices, selectedId, onSelect, geofences]);

  return (
    <div className="w-full h-full relative group bg-[#020617] overflow-hidden">
      {/* MAP CANVAS */}
      <div ref={containerRef} className="w-full h-full z-0 outline-none" />
      
      {/* TACTICAL CONTROLS (RIGHT DOCK) */}
      <div className="absolute top-6 right-6 z-[400] flex flex-col gap-3">
         <div className="flex flex-col bg-[#1e293b]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-1 shadow-2xl">
            <button 
                onClick={() => mapRef.current?.zoomIn()}
                className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 transition-all rounded-xl"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            </button>
            <div className="h-px bg-white/5 mx-2"></div>
            <button 
                onClick={() => mapRef.current?.zoomOut()}
                className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 transition-all rounded-xl"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
            </button>
         </div>

         <button 
            onClick={fitFleet}
            title="Focus Entire Fleet"
            className="w-12 h-12 bg-[#FFD100] text-[#003366] rounded-2xl flex items-center justify-center shadow-2xl shadow-yellow-500/20 active:scale-90 transition-all border border-yellow-400/50"
         >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-5a3 3 0 00-3-3h-2a3 3 0 00-3 3v5a2 2 0 002 2zM9 20H4v-5a3 3 0 013-3h2a3 3 0 013 3v5a2 2 0 01-2 2zM9 20h6v-5a3 3 0 00-3-3H9a3 3 0 00-3 3v5a2 2 0 003 2z" /></svg>
         </button>
         
         <button 
            onClick={cycleMapStyle}
            className="w-12 h-12 bg-[#1e293b]/80 backdrop-blur-xl border border-white/10 text-cyan-400 rounded-2xl flex items-center justify-center shadow-2xl hover:bg-[#1e293b] transition-all"
         >
            <div className="relative">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
                </span>
            </div>
         </button>
      </div>

      {/* OVERLAY: COORDINATE HUD */}
      <div className="absolute bottom-6 left-6 z-[400] flex items-center gap-4 bg-[#0f172a]/90 backdrop-blur-xl border border-white/5 px-4 py-2 rounded-2xl shadow-2xl">
          <div className="flex flex-col">
              <span className="text-[7px] font-black uppercase text-slate-500 tracking-widest mb-0.5">Tactical HUD</span>
              <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
                  <span className="text-[9px] font-mono text-emerald-400 uppercase tracking-widest">
                    {mapStyle === 'light' ? 'LIGHT_VIZ' : mapStyle === 'dark' ? 'NIGHT_VIZ' : 'SAT_VIZ'}
                  </span>
              </div>
          </div>
          <div className="h-6 w-px bg-white/10"></div>
          <div className="flex flex-col">
              <span className="text-[7px] font-black uppercase text-slate-500 tracking-widest mb-0.5">Traffic Uplink</span>
              <span className="text-[9px] font-mono text-blue-400 uppercase tracking-widest">SYNCHRONIZED</span>
          </div>
      </div>
    </div>
  );
};

export default MapComponent;
