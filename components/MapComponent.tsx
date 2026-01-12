
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
  const [isSatellite, setIsSatellite] = useState(false);
  const layerRef = useRef<any>(null);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.async = true;
    script.onload = () => {
      if (!containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current, { zoomControl: false, attributionControl: false }).setView([14.5547, 121.0244], 13);
      // CHANGED: Switched to CartoDB Light theme
      layerRef.current = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);
      mapRef.current = map;
    };
    document.head.appendChild(script);
    return () => { if (script.parentNode) script.parentNode.removeChild(script); };
  }, []);

  const toggleLayer = () => {
    if (!mapRef.current) return;
    mapRef.current.removeLayer(layerRef.current);
    if (isSatellite) {
      // CHANGED: Switch back to Light theme instead of Dark
      layerRef.current = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png').addTo(mapRef.current);
    } else {
      layerRef.current = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}').addTo(mapRef.current);
    }
    setIsSatellite(!isSatellite);
  };

  useEffect(() => {
    if (!mapRef.current) return;

    devices.forEach(device => {
      const isSelected = device.id === selectedId;
      const color = 
        device.status === 'Active' ? '#10b981' : 
        device.status === 'Meeting' ? '#3b82f6' : '#ef4444';
      
      const iconHtml = device.avatar ? `
        <div class="relative flex items-center justify-center">
          <div class="w-10 h-10 rounded-full border-2 border-white shadow-lg overflow-hidden bg-slate-200">
            <img src="${device.avatar}" class="w-full h-full object-cover" />
          </div>
          <div class="absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-white" style="background: ${color};"></div>
          ${isSelected ? `<div class="absolute w-12 h-12 border-2 border-[#FFD100] rounded-full animate-ping opacity-50"></div>` : ''}
        </div>
      ` : `
        <div class="relative flex items-center justify-center">
          <div style="background: ${color}; width: 14px; height: 14px; border: 2px solid #fff; border-radius: 50%; box-shadow: 0 0 15px ${color};"></div>
          ${isSelected ? `<div class="absolute w-10 h-10 border-2 border-[#FFD100] rounded-full animate-ping opacity-50"></div>` : ''}
        </div>
      `;

      if (markersRef.current[device.id]) {
        markersRef.current[device.id].setLatLng([device.lat, device.lng]);
        markersRef.current[device.id].setIcon(L.divIcon({ className: '', html: iconHtml, iconSize: [40, 40] }));
      } else {
        markersRef.current[device.id] = L.marker([device.lat, device.lng], {
          icon: L.divIcon({ className: '', html: iconHtml, iconSize: [40, 40] })
        }).addTo(mapRef.current).on('click', () => onSelect(device.id));
      }

      if (historyLayersRef.current[device.id]) mapRef.current.removeLayer(historyLayersRef.current[device.id]);
      if (isSelected && device.history.length > 0) {
          const path = [...device.history.map(h => [h.lat, h.lng]), [device.lat, device.lng]];
          historyLayersRef.current[device.id] = L.polyline(path, {
              color: '#FFD100', weight: 3, opacity: 0.6, dashArray: '5, 8'
          }).addTo(mapRef.current);
      }
    });

    if (selectedId && markersRef.current[selectedId]) {
      mapRef.current.panTo(markersRef.current[selectedId].getLatLng(), { animate: true });
    }
  }, [devices, selectedId, onSelect, geofences, isSatellite]);

  return (
    <div className="w-full h-full relative">
      <div ref={containerRef} className="w-full h-full z-0" />
      <div className="absolute bottom-6 left-6 z-[1000] flex gap-3">
        <button onClick={toggleLayer} className="bg-[#003366] text-[#FFD100] px-4 py-3 rounded-2xl font-black uppercase text-[10px] shadow-2xl tracking-widest border border-white/10">
          {isSatellite ? 'Street View' : 'Satellite View'}
        </button>
      </div>
    </div>
  );
};

export default MapComponent;
