"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const MODELS = ["llama-3-8b", "mistral-7b", "llama-3-70b", "stable-diffusion-xl", "flux"];
const QUANTIZATIONS = ["int4", "int8", "fp16"];

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();

  // Account state
  const [displayName, setDisplayName] = useState("Alex Kim");
  const [email] = useState("alex@buildlabs.dev");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  // Preferences state
  const [defaultModel, setDefaultModel] = useState("llama-3-8b");
  const [maxTokens, setMaxTokens] = useState("512");
  const [quantization, setQuantization] = useState("int8");

  // Danger zone
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const deleteEnabled = deleteConfirm === "delete my account";

  return (
    <div className="space-y-6 max-w-3xl">
      <Tabs defaultValue="account">
        <TabsList className="bg-[#12171C] border border-[#212930]">
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
          <TabsTrigger value="danger">Danger Zone</TabsTrigger>
        </TabsList>

        {/* Account Tab */}
        <TabsContent value="account" className="space-y-4 mt-4">
          <Card className="bg-[#12171C] border-[#212930]">
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="displayName" className="text-xs text-muted-foreground">
                  Display Name
                </Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="bg-[#0A0D10] border-[#212930] text-foreground"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs text-muted-foreground">
                  Email (read-only for OAuth accounts)
                </Label>
                <Input
                  id="email"
                  value={email}
                  readOnly
                  className="bg-[#0A0D10] border-[#212930] text-muted-foreground cursor-not-allowed"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[#12171C] border-[#212930]">
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Change Password</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="currentPassword" className="text-xs text-muted-foreground">
                  Current Password
                </Label>
                <Input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="bg-[#0A0D10] border-[#212930] text-foreground"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword" className="text-xs text-muted-foreground">
                  New Password
                </Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={8}
                  className="bg-[#0A0D10] border-[#212930] text-foreground"
                />
              </div>
              <Button
                variant="outline"
                className="border-[#212930]"
                disabled={!currentPassword || !newPassword}
              >
                Update Password
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Preferences Tab */}
        <TabsContent value="preferences" className="space-y-4 mt-4">
          <Card className="bg-[#12171C] border-[#212930]">
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Defaults</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Default Model</Label>
                <Select value={defaultModel} onValueChange={setDefaultModel}>
                  <SelectTrigger className="bg-[#0A0D10] border-[#212930]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#12171C] border-[#212930]">
                    {MODELS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Max Tokens</Label>
                <Input
                  type="number"
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(e.target.value)}
                  min={1}
                  max={32768}
                  className="bg-[#0A0D10] border-[#212930] text-foreground"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Quantization</Label>
                <Select value={quantization} onValueChange={setQuantization}>
                  <SelectTrigger className="bg-[#0A0D10] border-[#212930]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#12171C] border-[#212930]">
                    {QUANTIZATIONS.map((q) => (
                      <SelectItem key={q} value={q}>
                        {q}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[#12171C] border-[#212930]">
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Theme</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-foreground">Dark mode</p>
                  <p className="text-xs text-muted-foreground">
                    Toggle between light and dark theme
                  </p>
                </div>
                <Switch
                  checked={theme === "dark"}
                  onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Danger Zone Tab */}
        <TabsContent value="danger" className="mt-4">
          <Card className="bg-[#12171C] border-red-500/30">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-red-400">
                Delete Account
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                This action is permanent and cannot be undone. All your data, API keys,
                and job history will be permanently deleted.
              </p>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="border-red-500/50 text-red-400 hover:bg-red-500/10">
                    Delete my account
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="bg-[#12171C] border-[#212930]">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-foreground">
                      Are you absolutely sure?
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-muted-foreground">
                      Type{" "}
                      <span className="font-mono text-red-400">delete my account</span>{" "}
                      to confirm.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <Input
                    value={deleteConfirm}
                    onChange={(e) => setDeleteConfirm(e.target.value)}
                    placeholder="delete my account"
                    className="bg-[#0A0D10] border-[#212930] text-foreground font-mono"
                  />
                  <AlertDialogFooter>
                    <AlertDialogCancel className="border-[#212930]">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      disabled={!deleteEnabled}
                      className="bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      Delete permanently
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
