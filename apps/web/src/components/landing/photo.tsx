// Editorial photo slot. Uses a seeded placeholder photo (picsum) layered over a brand gradient,
// so the layout stays intentional if the image cannot load. Replace with real shoot photos.
export function Photo({ seed, w, h, className = "", position = "center" }: {
  seed: string;
  w: number;
  h: number;
  className?: string;
  position?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`bg-cover ${className}`}
      style={{
        backgroundImage: `url(https://picsum.photos/seed/${seed}/${w}/${h}), linear-gradient(160deg, #3b3324 0%, #1b1c1e 55%, #0e0f10 100%)`,
        backgroundPosition: position,
      }}
    />
  );
}
