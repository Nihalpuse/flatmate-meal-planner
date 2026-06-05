"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type OnboardingState = { error?: string };

export async function createGroup(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Group name is required" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_group", { group_name: name });
  if (error) return { error: error.message };

  redirect("/dashboard");
}

export async function joinGroup(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const code = String(formData.get("code") ?? "").trim();
  if (!code) return { error: "Invite code is required" };

  const supabase = await createClient();
  const { data: groupId, error } = await supabase.rpc("join_group", {
    invite_code: code,
  });
  if (error) return { error: error.message };
  if (!groupId) return { error: "No group found for that code" };

  redirect("/dashboard");
}
