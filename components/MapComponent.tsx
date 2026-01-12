import React, { useEffect, useRef } from 'react';
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
  const layerRef = useRef<any>(null);

  useEffect(() => {
    // Check if Leaflet is already loaded
    if (typeof L !== 'undefined') {
      initMap();
      return;
    }

    const script = document.createElement('script');
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.async = true;
    script.crossOrigin = "anonymous"; // Fix for "Script error" visibility
    script.onload = () => initMap();
    document.head.appendChild(script);

    // Don't remove the script on unmount, as L remains on window
    // return () => { if (script.parentNode) script.parentNode.removeChild(script); };
  }, []);

  const initMap = () => {
    if (!containerRef.current || mapRef.current) return;
    
    const map = L.map(containerRef.current, { 
      zoomControl: false, 
      attributionControl: false,
      preferCanvas: true
    }).setView([14.5547, 121.0244], 14);

    // Dark Matter Tactical Map Theme
    layerRef.current = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { 
      maxZoom: 19,
      subdomains: 'abcd'
    }).addTo(map);
    
    mapRef.current = map;
  };

  useEffect(() => {
    if (!mapRef.current || typeof L === 'undefined') return;

    devices.forEach(device => {
      const isSelected = device.id === selectedId;
      
      // Tactical Colors
      const color = 
        device.status === 'Active' || device.status === 'On Duty' ? '#10b981' : // Emerald
        device.status === 'Meeting' ? '#06b6d4' : // Cyan
        device.status === 'Break' ? '#f59e0b' : // Amber
        '#64748b'; // Slate (Offline)

      const glowColor = 
         device.status === 'Active' ? 'rgba(16, 185, 129, 0.5)' : 
         device.status === 'Meeting' ? 'rgba(6, 182, 212, 0.5)' : 
         'rgba(100, 116, 139, 0.5)';

      const zIndex = isSelected ? 1000 : 100;
      
      const iconHtml = `
        <div class="relative flex flex-col items-center justify-center transition-all duration-300" style="transform: ${isSelected ? 'scale(1.1)' : 'scale(1)'}">
          
          ${isSelected ? `
             <div class="absolute w-20 h-20 rounded-full animate-ping opacity-20" style="background: ${color}"></div>
             <div class="absolute w-12 h-12 rounded-full border border-white/20 animate-spin-slow" style="border-top-color: ${color}"></div>
          ` : ''}

          <!-- Avatar Container -->
          <div class="w-10 h-10 rounded-xl overflow-hidden bg-slate-900 border-2 relative shadow-2xl" style="border-color: ${isSelected ? '#fff' : color}; box-shadow: 0 0 15px ${glowColor}">
             <img src="${device.avatar || 'https://via.placeholder.com/40'}" class="w-full h-full object-cover" />
          </div>

          <!-- Label -->
          <div class="absolute -bottom-6 bg-slate-900/90 text-white text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded border border-white/10 whitespace-nowrap backdrop-blur-sm" style="color: ${isSelected ? '#fff' : color}">
            ${device.name.split(' ')[0]}
          </div>

          <!-- Status Indicator Dot -->
          <div class="absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-slate-900" style="background: ${color}"></div>
        </div>
      `;

      if (markersRef.current[device.id]) {
        markersRef.current[device.id].setLatLng([device.lat, device.lng]);
        markersRef.current[device.id].setZIndexOffset(zIndex);
        markersRef.current[device.id].setIcon(L.divIcon({ className: '', html: iconHtml, iconSize: [40, 40], iconAnchor: [20, 20] }));
      } else {
        markersRef.current[device.id] = L.marker([device.lat, device.lng], {
          icon: L.divIcon({ className: '', html: iconHtml, iconSize: [40, 40], iconAnchor: [20, 20] }),
          zIndexOffset: zIndex
        }).addTo(mapRef.current).on('click', () => onSelect(device.id));
      }

      // History Trail
      if (historyLayersRef.current[device.id]) mapRef.current.removeLayer(historyLayersRef.current[device.id]);
      if (isSelected && device.history.length > 0) {
          const path = [...device.history.map(h => [h.lat, h.lng]), [device.lat, device.lng]];
          historyLayersRef.current[device.id] = L.polyline(path, {
              color: '#06b6d4', weight: 2, opacity: 0.8, dashArray: '4, 8', className: 'animate-pulse'
          }).addTo(mapRef.current);
      }
    });

    if (selectedId && markersRef.current[selectedId]) {
      mapRef.current.panTo(markersRef.current[selectedId].getLatLng(), { animate: true, duration: 0.5 });
    }
  }, [devices, selectedId, onSelect, geofences]);

  return (
    <div className="w-full h-full relative group">
      <div ref={containerRef} className="w-full h-full z-0 bg-[#020617]" />
      
      {/* Map Controls Overlay */}
      <div className="absolute top-6 right-6 z-[400] flex flex-col gap-2">
         <button className="w-10 h-10 bg-[#1e293b] border border-white/10 rounded-lg flex items-center justify-center text-white hover:bg-[#334155] shadow-xl" onClick={() => mapRef.current?.zoomIn()}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
         </button>
         <button className="w-10 h-10 bg-[#1e293b] border border-white/10 rounded-lg flex items-center justify-center text-white hover:bg-[#334155] shadow-xl" onClick={() => mapRef.current?.zoomOut()}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
         </button>
          <button className="w-10 h-10 bg-[#06b6d4] border border-white/10 rounded-lg flex items-center justify-center text-white shadow-xl mt-4 animate-pulse">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
         </button>
      </div>
    </div>
  );
};

export default MapComponent;