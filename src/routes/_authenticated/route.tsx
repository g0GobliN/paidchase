import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    const onOnboarding = location.pathname === "/onboarding";
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_completed")
      .eq("user_id", data.user.id)
      .maybeSingle();

    if (!profile?.onboarding_completed && !onOnboarding) {
      throw redirect({ to: "/onboarding" });
    }
    if (profile?.onboarding_completed && onOnboarding) {
      throw redirect({ to: "/dashboard" });
    }

    return { user: data.user };
  },
  component: () => <Outlet />,
});
