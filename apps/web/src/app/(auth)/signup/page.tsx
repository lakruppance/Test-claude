import { SignupForm } from "./signup-form";

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const { next } = await searchParams;
  return <SignupForm next={typeof next === "string" ? next : undefined} />;
}
