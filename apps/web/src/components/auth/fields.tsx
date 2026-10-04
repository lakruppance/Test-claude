"use client";

import { useId } from "react";

const input =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";

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
      {props.help && <p id={helpId} className="text-sm text-zinc-600 dark:text-zinc-400">{props.help}</p>}
    </div>
  );
}

export function SubmitButton({ label, busy }: { label: string; busy: boolean }) {
  return (
    <button type="submit" disabled={busy}
      className="rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-50">
      {label}
    </button>
  );
}

export function FormMessage({ error, info }: { error?: string | null; info?: string | null }) {
  if (error) return <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>;
  if (info) return <p role="status" className="text-sm text-emerald-800 dark:text-emerald-300">{info}</p>;
  return null;
}
