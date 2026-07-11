"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, ArrowLeft } from "lucide-react";

// Mock token validation — any non-empty token is valid for MVP
function isTokenValid(token: string): boolean {
  // In production: validate token against DB expiry
  // For MVP: treat "expired" and "invalid" as bad tokens, everything else works
  return token !== "expired" && token !== "invalid" && token.length > 0;
}

export default function ResetPasswordPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tokenValid = isTokenValid(token);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    // Mock: simulate password update
    await new Promise((r) => setTimeout(r, 800));
    setLoading(false);
    router.push("/login");
  };

  // Invalid/expired token — show error, no form
  if (!tokenValid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0A0D10] p-4">
        <Card className="w-full max-w-md bg-[#12171C] border-[#212930]">
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto w-12 h-12 rounded-full bg-red-500/15 flex items-center justify-center">
              <AlertCircle className="h-6 w-6 text-red-400" />
            </div>
            <CardTitle className="text-xl font-display text-foreground">
              Invalid or expired link
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              This password reset link is invalid or has expired. Please request
              a new one.
            </p>
            <Link
              href="/forgot-password"
              className="inline-flex items-center gap-1.5 text-sm text-[#3DDC97] hover:text-[#3DDC97]/80 transition-colors"
            >
              Request new reset link
            </Link>
            <div>
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to login
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0A0D10] p-4">
      <Card className="w-full max-w-md bg-[#12171C] border-[#212930]">
        <CardHeader className="text-center space-y-2">
          <CardTitle className="text-xl font-display text-foreground">
            Set new password
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Enter your new password below.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="password"
                className="text-sm font-medium text-foreground"
              >
                New password
              </label>
              <Input
                id="password"
                type="password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="bg-[#0A0D10] border-[#212930]"
              />
            </div>
            <div className="space-y-2">
              <label
                htmlFor="confirm-password"
                className="text-sm font-medium text-foreground"
              >
                Confirm password
              </label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="Re-enter password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                className="bg-[#0A0D10] border-[#212930]"
              />
            </div>
            {error && (
              <p className="text-sm text-red-400 flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5" />
                {error}
              </p>
            )}
            <Button
              type="submit"
              disabled={loading || !password || !confirmPassword}
              className="w-full bg-[#3DDC97] text-[#06140D] hover:bg-[#3DDC97]/90 font-semibold"
            >
              {loading ? "Updating..." : "Reset password"}
            </Button>
            <div className="text-center">
              <Link
                href="/login"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Back to login
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
