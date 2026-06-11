import { CreateGroupForm } from "@/components/onboarding/create-group-form";
import { JoinGroupForm } from "@/components/onboarding/join-group-form";
import { GlassCard } from "@/components/ui/glass-card";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string | string[] }>;
}) {
  const { code } = await searchParams;
  const defaultCode = typeof code === "string" ? code : undefined;

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h1 className="text-2xl font-extrabold">🍛 Get set up</h1>
        <p className="text-sm text-muted-foreground">Create a flat or join one with a code.</p>
      </div>

      <GlassCard className="space-y-3">
        <h2 className="font-bold">Create a group</h2>
        <CreateGroupForm />
      </GlassCard>

      <GlassCard className="space-y-3">
        <h2 className="font-bold">Join a group</h2>
        <JoinGroupForm defaultCode={defaultCode} />
      </GlassCard>
    </div>
  );
}
