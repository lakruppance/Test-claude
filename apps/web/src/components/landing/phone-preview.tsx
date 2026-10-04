"use client";

import { Pause, Play } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { Photo } from "./photo";

// Real component preview of the product output: a vertical clip with word-by-word captions in
// the "Impact" style (active word in gold). Motion shows what the product does.
const LINES = [
  ["ON", "PERD", "TROIS"],
  ["HEURES", "PAR", "SEMAINE"],
  ["EN", "RÉUNIONS", "INUTILES."],
];

export function PhonePreview() {
  const reduce = useReducedMotion();
  const [tick, setTick] = useState(0);
  const [paused, setPaused] = useState(false);
  const playing = !reduce && !paused;
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setTick((t) => (t + 1) % 9), 420);
    return () => clearInterval(id);
  }, [playing]);
  const line = LINES[Math.floor(tick / 3)];
  const active = tick % 3;

  return (
    <div className="relative mx-auto aspect-[9/16] w-full max-w-[300px] overflow-hidden rounded-[28px] border border-line shadow-[0_30px_80px_-30px_rgb(var(--shadow)/0.45)]">
      <Photo seed="pepite-podcast-host" w={600} h={1066} className="absolute inset-0" position="center 30%" />
      <div className="absolute inset-x-0 top-[13%] flex justify-center px-6">
        <span className="rounded-md bg-white px-3 py-1 font-display text-sm font-bold text-[#121314]">3 heures perdues par semaine</span>
      </div>
      <div className="absolute inset-x-0 bottom-[30%] flex justify-center px-5" aria-hidden="true">
        <p className="text-center font-display text-[26px] font-extrabold leading-tight tracking-tight text-white [text-shadow:0_0_6px_#000,0_0_2px_#000]">
          {line.map((word, i) => (
            <motion.span
              key={`${tick}-${word}`}
              className={i === active ? "text-gold" : undefined}
              initial={reduce ? false : { scale: i === active ? 1.08 : 1 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              style={{ display: "inline-block", marginRight: 8 }}
            >
              {word}
            </motion.span>
          ))}
        </p>
      </div>
      {!reduce && (
        <button type="button" onClick={() => setPaused((p) => !p)} aria-pressed={paused}
          aria-label={paused ? "Lire l'animation" : "Mettre l'animation en pause"}
          className="absolute bottom-4 right-4 grid size-9 place-items-center rounded-full bg-[#121314]/80 text-white transition-colors hover:bg-[#121314]">
          {paused ? <Play size={16} weight="fill" aria-hidden="true" /> : <Pause size={16} weight="fill" aria-hidden="true" />}
        </button>
      )}
      <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-[#121314]/80 px-3 py-1 text-xs font-semibold text-white">
        <span className="font-mono">87</span>
        <span className="text-white/70">score</span>
      </div>
    </div>
  );
}
