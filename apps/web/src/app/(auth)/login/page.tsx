import { t } from "@/i18n/messages";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;
  return (
    <LoginForm
      next={typeof next === "string" ? next : undefined}
      initialError={error === "callback" ? t("auth.error.callback") : undefined}
    />
  );
}
