"use client";

import { useId } from "react";

import { buttonClass, inputClass as input } from "@/components/ui";

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
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-sm font-medium">{props.label}</label>
      <input id={id} name={props.name} type={props.type} required autoComplete={props.autoComplete}
        minLength={props.minLength} aria-describedby={props.help ? helpId : undefined} className={input} />
      {props.help && <p id={helpId} className="text-sm text-muted">{props.help}</p>}
    </div>
  );
}

export function SubmitButton({ label, busy }: { label: string; busy: boolean }) {
  return (
    <button type="submit" disabled={busy} className={buttonClass("primary", "lg")}>
      {label}
    </button>
  );
}

export function FormMessage({ error, info }: { error?: string | null; info?: string | null }) {
  if (error) return <p role="alert" className="text-sm text-danger">{error}</p>;
  if (info) return <p role="status" className="text-sm text-ink">{info}</p>;
  return null;
}
