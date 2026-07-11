import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { AdminShellClient } from "./AdminShellClient";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  // Defense-in-depth: server-side role check (middleware already guards, but belt-and-suspenders)
  if (!session || session.user.role !== "admin") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A0D10] text-[#E7EDF2]">
        <div className="text-center space-y-4 px-6">
          <div className="text-5xl">🚫</div>
          <h1 className="text-xl font-bold font-display">Access Denied</h1>
          <p className="text-[#8B96A1] text-sm max-w-sm">
            You do not have permission to access the admin area. Contact your
            system administrator if you believe this is an error.
          </p>
          <a
            href="/dashboard"
            className="inline-block mt-4 text-sm text-[#3DDC97] font-mono hover:underline"
          >
            ← Back to Dashboard
          </a>
        </div>
      </div>
    );
  }

  return <AdminShellClient>{children}</AdminShellClient>;
}
