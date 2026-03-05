import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AiStatusData {
  status: "ready" | "assisted" | "blocked" | "degraded";
  reason_code: "OK" | "AUTH_MISSING" | "NO_KEY" | "ASSIST_EXHAUSTED" | "POLICY_BLOCKED" | "PROVIDER_ERROR" | "DECRYPT_FAIL";
  hasOpenAIKey: boolean;
  hasGeminiKey: boolean;
  is_beta_tester: boolean;
  is_super_admin: boolean;
  assisted_ai_remaining: number;
  assisted_expired: boolean;
  mode_allowed: boolean;
  workspace_type: string;
  last_error: string | null;
  managed_mode_hint: "none" | "assisted_beta" | "platform_admin" | "platform_admin_fallback";
}

export function useAiStatus(enabled = true) {
  return useQuery<AiStatusData>({
    queryKey: ["ai-status"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("ai-status");
      if (error) throw error;
      return data as AiStatusData;
    },
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
