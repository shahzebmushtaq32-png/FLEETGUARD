
import { LatLng } from "../types";
import { supabase } from "./supabaseClient";

export const historyService = {
  getOfficerRoute: async (officerId: string): Promise<LatLng[]> => {
    if (!supabase) return [];
    
    // Fetch last 50 location points from Supabase
    const { data, error } = await supabase
        .from('location_history')
        .select('lat, lng, timestamp')
        .eq('node_id', officerId)
        .order('timestamp', { ascending: false })
        .limit(50);

    if (error || !data) {
        console.warn("[History] Failed to fetch route:", error);
        return [];
    }

    // Map to LatLng and reverse to show path from start to end
    return data.map((point: any) => ({
        lat: point.lat,
        lng: point.lng
    })).reverse();
  }
};
