import Link from "next/link";

export default function AdminNotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-4 text-center">
      <p className="text-sm font-semibold text-brand">404</p>
      <h1 className="font-display mt-2 text-[1.75rem] font-semibold">Halaman CMS tidak ditemukan</h1>
      <Link href="/admin" className="admin-button mt-6">
        Ke dashboard
      </Link>
    </main>
  );
}
