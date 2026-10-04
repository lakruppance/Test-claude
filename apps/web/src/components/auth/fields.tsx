"use client";

import { Eye, EyeSlash } from "@phosphor-icons/react";
import { useId, useState } from "react";

import { buttonClass, inputClass as input } from "@/components/ui";
import { t } from "@/i18n/messages";

export function Field(props: {
  label: string;
  type: string;
  name: string;
  autoComplete: string;
  help?: string;
  minLength?: number;
}) {
  const id = useId();
  const helpId = useId();
  const [visible, setVisible] = useState(false);
  const isPassword = props.type === "password";
  const isEmail = props.type === "email";
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-sm font-medium">{props.label}</label>
      <div className="relative">
        <input id={id} name={props.name} type={isPassword && visible ? "text" : props.type} required
          autoComplete={props.autoComplete} minLength={props.minLength}
          spellCheck={isEmail || isPassword ? false : undefined}
          autoCapitalize={isEmail || isPassword ? "none" : undefined}
          inputMode={isEmail ? "email" : undefined}
          aria-describedby={props.help ? helpId : undefined}
          className={`${input} ${isPassword ? "pr-12" : ""}`} />
        {isPassword && (
          <button type="button" onClick={() => setVisible((v) => !v)} aria-pressed={visible}
            aria-label={visible ? t("auth.hidePassword") : t("auth.showPassword")}
            className="absolute inset-y-0 right-1 my-auto grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-line/50 hover:text-ink">
            {visible ? <EyeSlash size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
          </button>
        )}
      </div>
      {props.help && <p id={helpId} className="text-sm text-muted">{props.help}</p>}
    </div>
  );
}

export function SubmitButton({ label, busy }: { label: string; busy: boolean }) {
  return (
    <button type="submit" disabled={busy} aria-busy={busy} className={buttonClass("primary", "lg")}>
      {busy ? `${label}…` : label}
    </button>
  );
}

export function FormMessage({ error, info }: { error?: string | null; info?: string | null }) {
  if (error) return <p role="alert" className="text-sm text-danger">{error}</p>;
  if (info) return <p role="status" className="text-sm text-ink">{info}</p>;
  return null;
}
