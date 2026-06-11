"use client";

import { useTheme } from "next-themes";
import { useTransition } from "react";
import { toast } from "sonner";

import {
  leaveGroup,
  promoteMember,
  removeMember,
  rotateInviteCode,
} from "@/app/(protected)/settings/actions";
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

export function SettingsView({
  settings,
  inviteLink,
}: {
  settings: GroupSettings;
  inviteLink: string;
}) {
  const [pending, start] = useTransition();
  const isAdmin = settings.role === "admin";

  function run(action: () => Promise<{ error?: string }>, success?: string) {
    start(async () => {
      const res = await action();
      if (res?.error) toast.error(res.error);
      else if (success) toast.success(success);
    });
  }

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
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard?.writeText(inviteLink);
                toast.success("Invite link copied");
              }}
            >
              Copy link
            </Button>
            {isAdmin ? (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => run(rotateInviteCode, "Invite code rotated")}
              >
                Rotate
              </Button>
            ) : null}
          </div>
        </div>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(
            `Join our flat on Aaj Kya Banega? ${inviteLink}`,
          )}`}
          target="_blank"
          rel="noreferrer"
          className="text-primary text-sm font-semibold underline underline-offset-2"
        >
          Share on WhatsApp
        </a>
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
              <span className="flex items-center gap-2">
                {isAdmin && !m.isYou && m.role === "member" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => run(() => promoteMember(m.id), "Promoted to admin")}
                  >
                    Make admin
                  </Button>
                ) : null}
                {isAdmin && !m.isYou ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => {
                      if (window.confirm(`Remove ${m.name ?? "this member"} from the group?`)) {
                        run(() => removeMember(m.id), "Member removed");
                      }
                    }}
                  >
                    Remove
                  </Button>
                ) : null}
                <Kicker variant={m.role === "admin" ? "solid" : "plain"}>{m.role}</Kicker>
              </span>
            </li>
          ))}
        </ul>
      </GlassCard>

      <GlassCard className="space-y-2">
        <Kicker>Theme</Kicker>
        <ThemeSelect />
      </GlassCard>

      <GlassCard className="space-y-2">
        <Kicker>Danger zone</Kicker>
        <Button
          variant="outline"
          disabled={pending}
          className="w-full"
          onClick={() => {
            if (window.confirm("Leave this group? You'll need an invite to rejoin.")) {
              run(leaveGroup);
            }
          }}
        >
          Leave group
        </Button>
      </GlassCard>

      <div className="pt-2">
        <LogoutButton />
      </div>
    </section>
  );
}
