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
  
  const [mapStyle, setMapStyle] = useState<'light' | 'dark' | 'satellite'>('light');

  useEffect(() => {
    // Check if Leaflet is already loaded
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
      preferCanvas: true
    }).setView([14.5547, 121.0244], 14);

    // 1. Base Layer (Default: Light)
    const layer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { 
      maxZoom: 19,
      subdomains: 'abcd',
      attribution: '&copy; OpenStreetMap &copy; CARTO'
    }).addTo(map);
    
    tileLayerRef.current = layer;

    // 2. Tactical Traffic Overlay
    // Using Google Traffic tiles overlay (lyrs=traffic for transparent traffic lines)
    L.tileLayer('https://mt0.google.com/vt?lyrs=traffic&x={x}&y={y}&z={z}', {
      maxZoom: 19,
      opacity: 0.8,
      className: 'traffic-layer'
    }).addTo(map);
    
    mapRef.current = map;
  };

  // Handle Style Switching
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

  useEffect(() => {
    if (!mapRef.current || typeof L === 'undefined') return;

    devices.forEach(device => {
      // Critical Safety: Ensure device exists and has coordinates before processing
      if (!device || device.lat === null || device.lng === null || device.lat === undefined || device.lng === undefined) return;

      const isSelected = device.id === selectedId;
      
      // Ensure numerical coordinates
      const lat = parseFloat(String(device.lat));
      const lng = parseFloat(String(device.lng));

      if (isNaN(lat) || isNaN(lng)) return;

      // Tactical Colors
      const color = 
        device.status === 'Active' || device.status === 'On Duty' ? '#10b981' : // Emerald
        device.status === 'Meeting' ? '#06b6d4' : // Cyan
        device.status === 'Break' ? '#f59e0b' : // Amber
        '#64748b'; // Slate (Offline)

      const zIndex = isSelected ? 1000 : 100;
      
      // High-contrast markers for Light Map
      const iconHtml = `
        <div class="relative flex flex-col items-center justify-center transition-all duration-300" style="transform: ${isSelected ? 'scale(1.1)' : 'scale(1)'}">
          
          ${isSelected ? `
             <div class="absolute w-20 h-20 rounded-full animate-ping opacity-20" style="background: ${color}"></div>
             <div class="absolute w-12 h-12 rounded-full border border-slate-900/20 animate-spin-slow" style="border-top-color: ${color}"></div>
          ` : ''}

          <!-- Avatar Container -->
          <div class="w-10 h-10 rounded-xl overflow-hidden bg-slate-900 border-2 relative shadow-2xl" style="border-color: ${isSelected ? '#000' : color}; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3)">
             <img src="${device.avatar || 'https://via.placeholder.com/40'}" class="w-full h-full object-cover" />
          </div>

          <!-- Label -->
          <div class="absolute -bottom-6 bg-slate-900 text-white text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded border border-slate-700 whitespace-nowrap backdrop-blur-sm shadow-lg">
            ${device.name ? device.name.split(' ')[0] : 'NODE'}
          </div>

          <!-- Status Indicator Dot -->
          <div class="absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-white" style="background: ${color}"></div>
        </div>
      `;

      if (markersRef.current[device.id]) {
        markersRef.current[device.id].setLatLng([lat, lng]);
        markersRef.current[device.id].setZIndexOffset(zIndex);
        markersRef.current[device.id].setIcon(L.divIcon({ className: '', html: iconHtml, iconSize: [40, 40], iconAnchor: [20, 20] }));
      } else {
        markersRef.current[device.id] = L.marker([lat, lng], {
          icon: L.divIcon({ className: '', html: iconHtml, iconSize: [40, 40], iconAnchor: [20, 20] }),
          zIndexOffset: zIndex
        }).addTo(mapRef.current).on('click', () => onSelect(device.id));
      }

      // History Trail (Sky Blue for visibility on light map)
      if (historyLayersRef.current[device.id]) mapRef.current.removeLayer(historyLayersRef.current[device.id]);
      
      if (isSelected && Array.isArray(device.history) && device.history.length > 0) {
          const validHistory = device.history.filter(h => h && h.lat !== null && h.lng !== null && typeof h.lat !== 'undefined');
          if (validHistory.length > 0) {
            const path = [...validHistory.map(h => [parseFloat(String(h.lat)), parseFloat(String(h.lng))]), [lat, lng]];
            historyLayersRef.current[device.id] = L.polyline(path, {
                color: '#0284c7', // Sky Blue
                weight: 3, 
                opacity: 0.8, 
                dashArray: '4, 8', 
                className: 'animate-pulse'
            }).addTo(mapRef.current);
          }
      }
    });

    if (selectedId && markersRef.current[selectedId]) {
      mapRef.current.panTo(markersRef.current[selectedId].getLatLng(), { animate: true, duration: 0.5 });
    }
  }, [devices, selectedId, onSelect, geofences]);

  return (
    <div className="w-full h-full relative group bg-slate-200">
      <div ref={containerRef} className="w-full h-full z-0" />
      
      {/* Map Controls */}
      <div className="absolute top-6 right-6 z-[400] flex flex-col gap-2">
         <button className="w-10 h-10 bg-white border border-slate-200 rounded-lg flex items-center justify-center text-slate-700 hover:bg-slate-50 shadow-xl transition-all active:scale-95" onClick={() => mapRef.current?.zoomIn()}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
         </button>
         <button className="w-10 h-10 bg-white border border-slate-200 rounded-lg flex items-center justify-center text-slate-700 hover:bg-slate-50 shadow-xl transition-all active:scale-95" onClick={() => mapRef.current?.zoomOut()}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
         </button>
         
         {/* Map Style Toggle (Replaces Microphone) */}
         <button 
            className="w-10 h-10 bg-white border border-slate-200 rounded-lg flex items-center justify-center text-slate-700 hover:bg-slate-50 shadow-xl mt-4 transition-all active:scale-95" 
            onClick={cycleMapStyle}
            title={`Switch Map Style (Current: ${mapStyle})`}
         >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
         </button>
      </div>

      {/* Traffic Legend */}
      <div className="absolute bottom-6 left-6 z-[400] bg-white/90 backdrop-blur px-3 py-1.5 rounded-md border border-slate-200 shadow-lg flex items-center gap-2">
          <div className="flex gap-0.5 h-1.5 w-10 bg-slate-200 rounded-full overflow-hidden">
             <div className="w-1/3 bg-green-500"></div>
             <div className="w-1/3 bg-yellow-500"></div>
             <div className="w-1/3 bg-red-500"></div>
          </div>
          <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Live Traffic</span>
      </div>
    </div>
  );
};

export default MapComponent;