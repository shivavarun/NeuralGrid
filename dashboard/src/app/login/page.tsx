"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("Invalid email or password");
    } else {
      router.push("/dashboard");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0A0D10]">
      <div className="w-full max-w-sm px-6">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <span className="h-[7px] w-[7px] rounded-sm bg-[#3DDC97] shadow-[0_0_6px_#3DDC97]" />
          <span className="font-display text-xl font-bold text-[#E7EDF2]">
            NeuralGrid
          </span>
        </div>

        <div className="rounded-xl border border-[#212930] bg-[#12171C] p-6 shadow-lg">
          <h1 className="text-center text-lg font-semibold text-[#E7EDF2] mb-6 font-display">
            Sign in to your account
          </h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label
                htmlFor="email"
                className="text-xs font-mono uppercase tracking-wider text-[#5C6670]"
              >
                Email
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                placeholder="dev@example.com"
                className="bg-[#0A0D10] border-[#212930] text-[#E7EDF2] placeholder:text-[#5C6670] focus:border-[#3DDC97] focus:ring-[#3DDC97]"
              />
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="password"
                className="text-xs font-mono uppercase tracking-wider text-[#5C6670]"
              >
                Password
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                placeholder="••••••••"
                className="bg-[#0A0D10] border-[#212930] text-[#E7EDF2] placeholder:text-[#5C6670] focus:border-[#3DDC97] focus:ring-[#3DDC97]"
              />
            </div>

            {error && (
              <p className="text-sm text-[#FF5470] bg-[#FF5470]/10 rounded-md px-3 py-2 border border-[#FF5470]/20">
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-[#3DDC97] text-[#06140D] font-mono font-semibold hover:bg-[#3DDC97]/90 disabled:opacity-50"
            >
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}
