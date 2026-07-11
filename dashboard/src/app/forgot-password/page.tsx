"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, ArrowLeft } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    // Always show success regardless of whether address exists (no leak)
    await new Promise((r) => setTimeout(r, 800));
    setSubmitted(true);
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0A0D10] p-4">
      <Card className="w-full max-w-md bg-[#12171C] border-[#212930]">
        <CardHeader className="text-center space-y-2">
          <CardTitle className="text-xl font-display text-foreground">
            Reset your password
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {submitted
              ? "Check your email for a reset link."
              : "Enter your email and we'll send a reset link."}
          </p>
        </CardHeader>
        <CardContent>
          {submitted ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-green-500/15 flex items-center justify-center">
                <Mail className="h-6 w-6 text-green-400" />
              </div>
              <p className="text-sm text-muted-foreground">
                If an account with that email exists, you&apos;ll receive a
                password reset link shortly.
              </p>
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label
                  htmlFor="email"
                  className="text-sm font-medium text-foreground"
                >
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="bg-[#0A0D10] border-[#212930]"
                />
              </div>
              <Button
                type="submit"
                disabled={loading || !email.trim()}
                className="w-full bg-[#3DDC97] text-[#06140D] hover:bg-[#3DDC97]/90 font-semibold"
              >
                {loading ? "Sending..." : "Send reset link"}
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
