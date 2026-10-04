import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Photo } from "@/components/landing/photo";
import { BRAND } from "@/lib/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-[100dvh] lg:grid-cols-2">
      <main id="contenu" className="flex flex-col px-4 py-8 md:px-10">
        <Link href="/" aria-label={`${BRAND.name}, accueil`} className="self-start"><Logo /></Link>
        <div className="mx-auto my-auto grid w-full max-w-sm gap-8 py-12">{children}</div>
      </main>
      <aside className="relative hidden overflow-hidden lg:block" aria-hidden="true">
        <Photo seed="pepite-auth-mic" w={1000} h={1400} className="absolute inset-0" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0e0f10]/90 via-[#0e0f10]/20 to-transparent" />
        <p className="absolute bottom-10 left-10 right-10 font-display text-3xl font-bold text-white">{BRAND.tagline}</p>
      </aside>
    </div>
  );
}
