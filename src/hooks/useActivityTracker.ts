import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useActivityTracker() {
  const { user } = useAuth();
  const location = useLocation();
  const prevPath = useRef("");

  useEffect(() => {
    if (!user || location.pathname === prevPath.current) return;
    prevPath.current = location.pathname;

    supabase.from("user_activity").insert({
      user_id: user.id,
      action: "page_view",
      metadata: { path: location.pathname },
    }).then(() => {});
  }, [location.pathname, user]);
}

export async function trackAction(userId: string, action: string, metadata: Record<string, any> = {}) {
  try {
    await supabase.from("user_activity").insert({
      user_id: userId,
      action,
      metadata,
    });
  } catch {
    // silent fail for telemetry
  }
}
