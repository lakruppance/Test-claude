"use client";

import { styleName } from "@/components/ui";
import { t } from "@/i18n/messages";

export const STYLES = ["impact", "boite", "epure"] as const;
export type SubtitleStyle = (typeof STYLES)[number];

function StylePreview({ style }: { style: string }) {
  if (style === "impact") return <span className="whitespace-nowrap font-display text-[11px] font-extrabold uppercase text-white [text-shadow:0_0_3px_#000] sm:text-sm">Le <span className="text-gold">mot</span> fort</span>;
  if (style === "boite") return <span className="whitespace-nowrap rounded bg-black/60 px-1 text-[11px] font-semibold sm:px-1.5 text-white sm:text-base">Le <span className="text-[#3ddc84]">mot</span> clé</span>;
  return <span className="whitespace-nowrap text-[11px] font-semibold text-white/60 sm:text-sm">Le <span className="text-white">mot</span> discret</span>;
}

// Subtitle style as visual radio cards: the preview says more than the name.
export function StylePicker(props: { legend: string; name: string; value: string; onChange: (s: SubtitleStyle) => void; disabled?: boolean; legendClassName?: string }) {
  return (
    <fieldset className="grid gap-3" disabled={props.disabled}>
      <legend className={props.legendClassName ?? "mb-2 text-sm font-medium"}>{props.legend}</legend>
      <div className="grid grid-cols-3 gap-3">
        {STYLES.map((s) => (
          <label key={s} className={`grid cursor-pointer gap-2 rounded-2xl border p-2 sm:p-3 transition-colors has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)] ${props.value === s ? "border-gold shadow-[0_0_0_1px_var(--gold)]" : "border-line hover:border-muted"}`}>
            <input type="radio" name={props.name} value={s} checked={props.value === s} onChange={() => props.onChange(s)} className="sr-only" />
            <span className="grid h-16 place-items-center overflow-hidden rounded-xl bg-[#2a2c2f]"><StylePreview style={s} /></span>
            <span className="text-sm font-medium">{styleName(t(`upload.style.${s}`))}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
