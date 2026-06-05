import { redirect } from "next/navigation";

import { RegisterForm } from "@/components/auth/register-form";
import { createClient } from "@/lib/supabase/server";

export default async function RegisterPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return <RegisterForm />;
}
