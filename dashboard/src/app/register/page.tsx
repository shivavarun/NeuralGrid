"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // MVP: mock registration — would call POST /v1/auth/register
      await new Promise((resolve) => setTimeout(resolve, 800));

      // Show free-tier credit amount before redirect
      setShowSuccess(true);
      setTimeout(() => {
        router.push("/onboarding");
      }, 2500);
    } catch {
      setError("Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (showSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0A0D10] px-4">
        <Card className="w-full max-w-md bg-[#12171C] border-[#212930]">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-green-500/15 flex items-center justify-center">
              <span className="text-green-400 text-xl">✓</span>
            </div>
            <CardTitle className="text-lg text-foreground">Account created!</CardTitle>
            <CardDescription className="text-muted-foreground">
              You&apos;ve been credited{" "}
              <span className="text-green-400 font-mono font-bold">$2.00</span>{" "}
              in free compute credits to get started.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-xs text-muted-foreground">Redirecting to onboarding...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0A0D10] px-4">
      <Card className="w-full max-w-md bg-[#12171C] border-[#212930]">
        <CardHeader className="text-center">
          <CardTitle className="text-lg text-foreground">Create your account</CardTitle>
          <CardDescription className="text-muted-foreground">
            Start running AI inference at up to 90% less cost.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm text-muted-foreground">
                Name
              </Label>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex Kim"
                required
                className="bg-[#0A0D10] border-[#212930] text-foreground"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm text-muted-foreground">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                className="bg-[#0A0D10] border-[#212930] text-foreground"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm text-muted-foreground">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={8}
                className="bg-[#0A0D10] border-[#212930] text-foreground"
              />
            </div>

            {error && (
              <p className="text-sm text-red-400 font-mono">{error}</p>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-[#3DDC97] text-[#06140D] font-mono font-semibold hover:bg-[#3DDC97]/90"
            >
              {loading ? "Creating account..." : "Create account"}
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="text-[#3DDC97] hover:underline">
                Sign in
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
