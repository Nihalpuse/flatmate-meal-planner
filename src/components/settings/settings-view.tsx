"use client";

import { useTheme } from "next-themes";
import { toast } from "sonner";

import { LogoutButton } from "@/components/auth/logout-button";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Kicker } from "@/components/ui/kicker";
import type { GroupSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

const THEMES = ["light", "dark", "system"] as const;

function ThemeSelect() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="flex gap-2">
      {THEMES.map((t) => (
        <button
          key={t}
          type="button"
          aria-pressed={theme === t}
          onClick={() => setTheme(t)}
          className={cn(
            "flex-1 rounded-lg border py-2 text-sm font-semibold capitalize",
            theme === t ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground",
          )}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

export function SettingsView({ settings }: { settings: GroupSettings }) {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-extrabold">Settings</h1>

      <GlassCard className="space-y-1">
        <Kicker>Group</Kicker>
        <div className="text-lg font-extrabold">{settings.name}</div>
      </GlassCard>

      <GlassCard className="space-y-2">
        <Kicker>Invite code</Kicker>
        <div className="flex items-center justify-between gap-3">
          <code className="font-mono text-lg font-bold tracking-wider">{settings.inviteCode}</code>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              navigator.clipboard?.writeText(settings.inviteCode);
              toast.success("Invite code copied");
            }}
          >
            Copy
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">Share this so flatmates can join.</p>
      </GlassCard>

      <GlassCard className="space-y-2">
        <Kicker>Members ({settings.members.length})</Kicker>
        <ul className="space-y-1">
          {settings.members.map((m) => (
            <li key={m.id} className="flex items-center justify-between text-sm">
              <span className="font-semibold">
                <span>{m.name ?? "Member"}</span>
                {m.isYou ? (
                  <span className="text-muted-foreground"> (you)</span>
                ) : null}
              </span>
              <Kicker variant={m.role === "admin" ? "solid" : "plain"}>{m.role}</Kicker>
            </li>
          ))}
        </ul>
      </GlassCard>

      <GlassCard className="space-y-2">
        <Kicker>Theme</Kicker>
        <ThemeSelect />
      </GlassCard>

      <div className="pt-2">
        <LogoutButton />
      </div>
    </section>
  );
}
