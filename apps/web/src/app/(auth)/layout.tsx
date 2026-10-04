export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto grid w-full max-w-sm content-start gap-8 px-4 py-20">{children}</main>;
}
