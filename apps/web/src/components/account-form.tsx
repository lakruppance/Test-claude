"use client";

import { useId, useState } from "react";
import { StylePicker, type SubtitleStyle } from "@/components/style-picker";
import { buttonClass, inputClass } from "@/components/ui";
import { t } from "@/i18n/messages";

type Style = SubtitleStyle;

export function AccountForm(props: { displayName: string; defaultStyle: Style; defaultWithHook: boolean }) {
  const ids = { name: useId(), hook: useId() };
  const [displayName, setDisplayName] = useState(props.displayName);
  const [defaultStyle, setDefaultStyle] = useState<Style>(props.defaultStyle);
  const [defaultWithHook, setDefaultWithHook] = useState(props.defaultWithHook);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setState("saving");
    const res = await fetch("/api/account", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName, defaultStyle, defaultWithHook }),
    }).catch(() => null);
    setState(res?.ok ? "saved" : "error");
  }

  const dirty = () => state === "saved" && setState("idle");

  return (
    <form onSubmit={submit} className="grid max-w-lg gap-5">
      <div className="grid gap-2">
        <label htmlFor={ids.name} className="text-sm font-medium">{t("account.name")}</label>
        <input id={ids.name} name="displayName" autoComplete="name" maxLength={80} value={displayName}
          onChange={(e) => { setDisplayName(e.target.value); dirty(); }} className={inputClass} />
      </div>
      <fieldset className="grid gap-4">
        <legend className="mb-2 text-sm font-medium">{t("account.defaults")}</legend>
        <StylePicker legend={t("upload.style")} name="defaultStyle" value={defaultStyle}
          onChange={(v) => { setDefaultStyle(v); dirty(); }} />
        <label htmlFor={ids.hook} className="flex items-center gap-3 text-sm">
          <input id={ids.hook} type="checkbox" checked={defaultWithHook} className="size-4 accent-gold"
            onChange={(e) => { setDefaultWithHook(e.target.checked); dirty(); }} />
          {t("upload.hook")}
        </label>
      </fieldset>
      <div className="flex items-center gap-4">
        <button type="submit" disabled={state === "saving"} className={buttonClass("primary")}>{state === "saving" ? t("account.saving") : t("account.save")}</button>
        <p aria-live="polite" className="text-sm">
          {state === "saved" && t("account.saved")}
          {state === "error" && <span className="text-danger">{t("account.error")}</span>}
        </p>
      </div>
    </form>
  );
}
