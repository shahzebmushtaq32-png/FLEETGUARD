
import { supabase } from "./supabaseClient";

export const r2Service = {
  uploadEvidence: async (base64Data: string, fileName: string): Promise<string> => {
    if (!supabase) {
        console.warn("Storage unavailable in Local Mode. Returning local base64.");
        return base64Data;
    }

    try {
      const base64Response = await fetch(base64Data);
      const blob = await base64Response.blob();
      const filePath = `evidence/${Date.now()}_${fileName}`;

      const { error } = await supabase.storage.from('fleet-assets').upload(filePath, blob);
      if (error) throw error;

      const { data: urlData } = supabase.storage.from('fleet-assets').getPublicUrl(filePath);
      return urlData.publicUrl;
    } catch (error) {
      console.error('[Supabase Storage] Upload Error:', error);
      return base64Data; 
    }
  },
  getSignedUrl: (path: string): string => path
};
