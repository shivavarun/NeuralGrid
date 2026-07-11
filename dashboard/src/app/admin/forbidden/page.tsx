import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0A0D10] text-[#E7EDF2]">
      <div className="text-center space-y-4 px-6">
        <div className="text-5xl">🚫</div>
        <h1 className="text-xl font-bold font-display">Access Denied</h1>
        <p className="text-[#8B96A1] text-sm max-w-sm">
          You do not have permission to access the admin area. This incident has
          been logged.
        </p>
        <Link
          href="/dashboard"
          className="inline-block mt-4 text-sm text-[#3DDC97] font-mono hover:underline"
        >
          ← Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
