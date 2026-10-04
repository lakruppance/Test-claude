import {
  ArrowRight,
  Broadcast,
  CloudArrowUp,
  Scissors,
  Subtitles,
  UserFocus,
  YoutubeLogo,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { PhonePreview } from "@/components/landing/phone-preview";
import { Photo } from "@/components/landing/photo";
import { Reveal } from "@/components/landing/reveal";
import { ButtonLink } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

type Plan = { id: string; name: string; price_eur_cents: number; monthly_minutes: number; max_video_minutes: number; watermark: boolean; direct_publish: boolean; channel_monitoring: boolean; max_channels: number };

const FALLBACK_PLANS: Plan[] = [
  { id: "free", name: "Gratuit", price_eur_cents: 0, monthly_minutes: 30, max_video_minutes: 20, watermark: true, direct_publish: false, channel_monitoring: false, max_channels: 0 },
  { id: "creator", name: "Créateur", price_eur_cents: 1900, monthly_minutes: 300, max_video_minutes: 90, watermark: false, direct_publish: true, channel_monitoring: false, max_channels: 0 },
  { id: "pro", name: "Pro", price_eur_cents: 4900, monthly_minutes: 1000, max_video_minutes: 180, watermark: false, direct_publish: true, channel_monitoring: true, max_channels: 1 },
  { id: "studio", name: "Studio", price_eur_cents: 12900, monthly_minutes: 3000, max_video_minutes: 180, watermark: false, direct_publish: true, channel_monitoring: true, max_channels: 5 },
];

async function loadPlans(): Promise<Plan[]> {
  try {
    const { data } = await supabaseAdmin().from("plans").select("*").order("sort");
    return data?.length ? (data as Plan[]) : FALLBACK_PLANS;
  } catch {
    return FALLBACK_PLANS;
  }
}

const SEGMENTS = [
  { left: 6, width: 7, score: 64 },
  { left: 22, width: 9, score: 87 },
  { left: 41, width: 6, score: 58 },
  { left: 57, width: 8, score: 79 },
  { left: 78, width: 10, score: 91 },
];

const FAQ = [
  ["Puis-je utiliser n'importe quelle vidéo ?", "Non. Vous certifiez à chaque ajout être propriétaire de la vidéo ou avoir l'autorisation de son créateur. Cette déclaration est enregistrée. Un contenu signalé est retiré."],
  ["Quelles langues sont prises en charge ?", "Le français et l'anglais, pour la transcription comme pour les titres et descriptions proposés."],
  ["Et si YouTube bloque l'import d'une vidéo ?", "Cela arrive : YouTube limite les téléchargements depuis des serveurs. Nous vous le disons clairement et vous pouvez envoyer le fichier directement, depuis YouTube Studio par exemple."],
  ["Que deviennent mes vidéos ?", "Elles restent privées et ne sont visibles que par vous. Les fichiers sources sont supprimés automatiquement après 7 jours, les clips après 90 jours."],
  ["Puis-je modifier un clip ?", "Oui. Vous ajustez le début et la fin (calés sur les mots), changez le style des sous-titres ou l'accroche, puis vous régénérez le clip."],
  ["Puis-je résilier à tout moment ?", "Oui, depuis votre compte, sans engagement. Le plan gratuit reste disponible."],
];

export default async function Landing() {
  const [user, plans] = await Promise.all([currentUser().catch(() => null), loadPlans()]);
  const price = (cents: number) => (cents === 0 ? "0 €" : `${(cents / 100).toFixed(0)} €`);

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="sticky top-0 z-30 border-b border-line/70 bg-paper/85 backdrop-blur">
        <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-8" aria-label="Navigation principale">
          <Link href="/" aria-label={`${BRAND.name}, accueil`}><Logo /></Link>
          <div className="flex items-center gap-1 text-sm md:gap-3">
            <a href="#tarifs" className="hidden rounded-full px-3 py-2 hover:bg-line/50 sm:inline">Tarifs</a>
            <a href="#faq" className="hidden rounded-full px-3 py-2 hover:bg-line/50 sm:inline">Questions</a>
            {user ? (
              <ButtonLink href="/app" size="sm">Ouvrir l&apos;app</ButtonLink>
            ) : (
              <>
                <Link href="/login" className="rounded-full px-3 py-2 hover:bg-line/50">Connexion</Link>
                <ButtonLink href="/signup" size="sm">Essayer gratuitement</ButtonLink>
              </>
            )}
          </div>
        </nav>
      </header>

      <main id="contenu">
        {/* 1. Hero */}
        <section className="mx-auto grid max-w-7xl items-center gap-12 px-4 pb-20 pt-12 md:grid-cols-12 md:px-8 md:pt-20">
          <Reveal className="grid gap-6 md:col-span-6 lg:col-span-5">
            <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight md:text-5xl lg:text-6xl">
              Vos vidéos longues cachent des pépites.
            </h1>
            <p className="max-w-[46ch] text-lg text-muted">
              {BRAND.name} repère les meilleurs moments, les recadre en vertical et les sous-titre. Prêts pour TikTok et Shorts.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <ButtonLink href="/signup" size="lg">Essayer gratuitement</ButtonLink>
              <a href="#tarifs" className="inline-flex items-center gap-1 text-sm font-semibold underline underline-offset-4">
                Voir les tarifs <ArrowRight size={16} weight="bold" aria-hidden="true" />
              </a>
            </div>
          </Reveal>
          <div className="md:col-span-6 md:-mt-8 lg:col-span-6 lg:col-start-7">
            <PhonePreview />
          </div>
        </section>

        {/* 2. Before / after */}
        <section className="border-y border-line bg-surface">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-20 md:px-8">
            <Reveal className="grid max-w-2xl gap-3">
              <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl">Une heure de vidéo. Trois clips. Zéro montage.</h2>
              <p className="text-muted">Chaque passage est évalué, puis les meilleurs deviennent des clips verticaux recadrés sur le visage.</p>
            </Reveal>
            <Reveal className="grid items-center gap-8 lg:grid-cols-[1.4fr_auto_1fr]">
              <figure className="grid gap-3">
                <Photo seed="pepite-interview-wide" w={1280} h={720} className="aspect-video w-full rounded-2xl" />
                <div className="relative h-8 rounded-full bg-line" role="img" aria-label="Timeline de la vidéo avec cinq passages repérés, notés de 58 à 91">
                  {SEGMENTS.map((s) => (
                    <span key={s.left} className="absolute top-1 h-6 rounded-full bg-gold" style={{ left: `${s.left}%`, width: `${s.width}%`, opacity: 0.25 + (s.score - 50) / 55 }} />
                  ))}
                </div>
                <figcaption className="text-sm text-muted">La vidéo d&apos;origine, 58 min, et les passages repérés : plus l&apos;or est intense, meilleur est le score.</figcaption>
              </figure>
              <ArrowRight size={32} className="mx-auto hidden rotate-0 text-muted lg:block" aria-hidden="true" />
              <div className="grid grid-cols-3 gap-3">
                {[{ pos: "30% 40%", score: 91 }, { pos: "50% 40%", score: 87 }, { pos: "70% 40%", score: 79 }].map((c) => (
                  <figure key={c.pos} className="grid gap-2">
                    <Photo seed="pepite-interview-wide" w={1280} h={720} position={c.pos} className="aspect-[9/16] w-full rounded-xl" />
                    <figcaption className="font-mono text-xs text-muted">score {c.score}</figcaption>
                  </figure>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* 3. How it works */}
        <section className="mx-auto max-w-7xl px-4 py-24 md:px-8">
          <h2 className="sr-only">Comment ça marche</h2>
          <div className="grid gap-10 md:grid-cols-[5fr_4fr_3fr] md:divide-x md:divide-line">
            {[
              ["Ajoutez", "Envoyez un fichier, collez un lien Drive, Dropbox ou YouTube, ou laissez-nous surveiller votre chaîne."],
              ["Relisez", "Chaque clip arrive avec son score et sa justification. Ajustez les bornes, le style, l'accroche."],
              ["Publiez", "Téléchargez en 1080x1920 ou publiez sur YouTube Shorts et TikTok, avec titres et hashtags prêts."],
            ].map(([title, text], i) => (
              <Reveal key={title} delay={i * 0.08} className="grid content-start gap-3 md:px-8 first:md:pl-0">
                <h3 className="font-display text-2xl font-bold">{title}</h3>
                <p className="max-w-[40ch] text-muted">{text}</p>
              </Reveal>
            ))}
          </div>
        </section>

        {/* 4. Features bento */}
        <section className="mx-auto max-w-7xl px-4 pb-24 md:px-8">
          <h2 className="mb-8 max-w-2xl font-display text-3xl font-bold tracking-tight md:text-4xl">Tout le montage court, sans le montage.</h2>
          <div className="grid gap-4 md:grid-cols-6 md:grid-rows-2">
            <Reveal className="relative overflow-hidden rounded-2xl md:col-span-3 md:row-span-2">
              <Photo seed="pepite-studio-portrait" w={900} h={900} className="absolute inset-0" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0e0f10] via-[#0e0f10]/40 to-transparent" />
              <div className="relative flex h-full min-h-[320px] flex-col justify-end gap-2 p-6 text-white">
                <UserFocus size={28} aria-hidden="true" />
                <h3 className="font-display text-2xl font-bold">Recadrage sur le visage</h3>
                <p className="max-w-[40ch] text-white/80">Le cadre suit la personne qui parle, sans à-coups. Sans visage, un fond flouté prend le relais.</p>
              </div>
            </Reveal>
            <Reveal className="grid content-between gap-6 rounded-2xl bg-gold-soft p-6 md:col-span-3">
              <Subtitles size={28} aria-hidden="true" />
              <div className="grid gap-2">
                <h3 className="font-display text-xl font-bold">Sous-titres mot à mot, 3 styles</h3>
                <p className="font-display text-lg font-extrabold uppercase tracking-tight">Le mot <span className="rounded bg-[#121314] px-1.5 text-gold">prononcé</span> ressort</p>
              </div>
            </Reveal>
            <Reveal className="grid content-between gap-6 rounded-2xl border border-line bg-surface p-6 md:col-span-2">
              <CloudArrowUp size={28} aria-hidden="true" />
              <div className="grid gap-1">
                <h3 className="font-display text-lg font-bold">Fichier, Drive, Dropbox, YouTube</h3>
                <p className="text-sm text-muted">Jusqu&apos;à 5 Go, envoi repris s&apos;il est interrompu.</p>
              </div>
            </Reveal>
            <Reveal className="grid content-between gap-6 rounded-2xl border border-line bg-surface p-6">
              <Broadcast size={28} aria-hidden="true" />
              <h3 className="font-display text-lg font-bold">Veille de chaîne</h3>
            </Reveal>
          </div>
          <Reveal className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-[#121314] p-6 text-white">
            <div className="flex items-center gap-3">
              <YoutubeLogo size={28} aria-hidden="true" />
              <Scissors size={28} aria-hidden="true" />
              <p className="font-display text-lg font-bold">Publication YouTube Shorts et TikTok, titres et hashtags inclus.</p>
            </div>
          </Reveal>
        </section>

        {/* 5. Score (second-read moment) */}
        <section className="border-y border-line bg-surface">
          <div className="mx-auto grid max-w-7xl gap-12 px-4 py-24 md:grid-cols-[1fr_1.3fr] md:px-8">
            <Reveal className="grid content-start gap-4">
              <p className="font-mono text-[9rem] font-bold leading-none tracking-tighter md:text-[12rem]">87</p>
              <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl">Chaque clip est noté. Et expliqué.</h2>
            </Reveal>
            <Reveal className="grid content-center gap-8 sm:grid-cols-2">
              {[
                ["92", "Accroche", "Les 3 premières secondes donnent envie de rester."],
                ["88", "Autonomie", "Compréhensible sans avoir vu le reste."],
                ["79", "Intensité", "Une idée forte, une émotion, un chiffre."],
                ["85", "Chute", "Se termine sur une phrase qui conclut."],
              ].map(([n, label, text]) => (
                <div key={label} className="grid gap-1 border-t border-line pt-4">
                  <p className="flex items-baseline gap-3"><span className="font-mono text-2xl font-bold">{n}</span><span className="font-semibold">{label}</span></p>
                  <p className="text-sm text-muted">{text}</p>
                </div>
              ))}
            </Reveal>
          </div>
        </section>

        {/* 6. Pricing */}
        <section id="tarifs" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-24 md:px-8">
          <div className="mb-10 grid max-w-2xl gap-3">
            <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl">Payez les minutes que vous traitez.</h2>
            <p className="text-muted">Sans engagement. Le quota se compte en minutes de vidéo source analysées.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {plans.map((plan) => {
              const featured = plan.id === "creator";
              return (
                <article key={plan.id} className={`grid content-start gap-5 rounded-2xl border p-6 ${featured ? "border-gold bg-gold-soft/40 shadow-[0_0_0_1px_var(--gold)]" : "border-line bg-surface"}`}>
                  <div className="grid gap-1">
                    <h3 className="font-display text-xl font-bold">{plan.name}</h3>
                    <p><span className="font-display text-4xl font-extrabold">{price(plan.price_eur_cents)}</span><span className="text-muted"> / mois</span></p>
                  </div>
                  <ul className="grid gap-2 text-sm">
                    <li><span className="font-mono font-semibold">{plan.monthly_minutes}</span> min de vidéo par mois</li>
                    <li>Vidéos jusqu&apos;à <span className="font-mono">{plan.max_video_minutes}</span> min</li>
                    <li>{plan.watermark ? "Clips avec filigrane" : "Sans filigrane"}</li>
                    <li>{plan.direct_publish ? "Publication YouTube et TikTok" : "Export à télécharger"}</li>
                    {plan.channel_monitoring && <li>Veille de {plan.max_channels} chaîne{plan.max_channels > 1 ? "s" : ""}, traitement auto</li>}
                  </ul>
                  <ButtonLink href={`/signup?plan=${plan.id}`} variant={featured ? "primary" : "secondary"}>
                    {plan.price_eur_cents === 0 ? "Essayer gratuitement" : `Choisir ${plan.name}`}
                  </ButtonLink>
                </article>
              );
            })}
          </div>
          <p className="mt-4 text-sm text-muted">Prix TTC. Le paiement en ligne arrive bientôt : les plans payants s&apos;activent depuis votre compte.</p>
        </section>

        {/* 7. FAQ */}
        <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 pb-24 md:px-8">
          <h2 className="mb-6 font-display text-3xl font-bold tracking-tight">Questions fréquentes</h2>
          <div className="divide-y divide-line border-y border-line">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                  {q}
                  <span aria-hidden="true" className="font-mono text-xl transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 max-w-[65ch] text-muted">{a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* 8. Final CTA */}
        <section className="bg-[#121314] text-[#ededeb]">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-6 px-4 py-16 md:px-8">
            <h2 className="max-w-xl font-display text-3xl font-bold tracking-tight md:text-4xl">Trouvez la pépite de votre prochaine vidéo.</h2>
            <ButtonLink href="/signup" size="lg">Essayer gratuitement</ButtonLink>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-muted md:px-8">
          <Logo className="text-ink" />
          <nav className="flex flex-wrap gap-4" aria-label="Liens du pied de page">
            <a href="#tarifs" className="hover:text-ink">Tarifs</a>
            <Link href="/login" className="hover:text-ink">Connexion</Link>
            <span>CGU et confidentialité : bientôt</span>
          </nav>
        </div>
      </footer>
    </div>
  );
}
