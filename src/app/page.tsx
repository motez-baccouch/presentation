import Link from "next/link";
import Image from "next/image";
import { getPresentation } from "@/lib/db";
import { SlideThumb } from "@/components/SlideThumb";
import { LiveRefresh } from "@/components/LiveRefresh";
import { getMember } from "@/lib/team";

export const dynamic = "force-dynamic";

export default async function Home() {
  const deck = await getPresentation();

  return (
    <main className="flex-1">
      <LiveRefresh />
      {/* Hero */}
      <section className="sigma-mesh relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-6 pt-10 pb-20">
          <header className="flex items-center justify-between">
            <Image
              src="/brand/logo.svg"
              alt="Sigma"
              width={132}
              height={60}
              priority
              className="h-9 w-auto"
            />
            <nav className="flex items-center gap-3 text-sm font-semibold">
              <Link
                href="/present"
                className="rounded-full px-4 py-2 text-sigma-ink/70 transition hover:text-sigma-ink"
              >
                Present
              </Link>
              <Link
                href="/edit"
                className="sigma-gradient rounded-full px-5 py-2 text-white shadow-card transition hover:brightness-105"
              >
                Open editor
              </Link>
            </nav>
          </header>

          <div className="mt-20 max-w-3xl">
            <p className="font-display text-sm font-bold uppercase tracking-[0.35em] text-sigma-orange">
              Sigma Lending · Dev Team
            </p>
            <h1 className="mt-4 font-display text-6xl font-extrabold leading-[1.02] text-sigma-ink sm:text-7xl">
              The weekly update,
              <br />
              <span className="sigma-gradient-text">built by the team.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-sigma-ink/70">
              No more chasing everyone in Slack and rebuilding slides in Canva.
              Type{" "}
              <code className="rounded bg-white/70 px-2 py-0.5 font-mono text-[0.85em] text-sigma-red">
                /presentation
              </code>{" "}
              with your update — it lands here, on-brand, ready to tweak and
              present.
            </p>
            <div className="mt-9 flex flex-wrap gap-4">
              <Link
                href="/present"
                className="sigma-gradient rounded-full px-7 py-3.5 text-base font-semibold text-white shadow-card transition hover:brightness-105"
              >
                ▶ Present now
              </Link>
              <Link
                href="/edit"
                className="rounded-full border border-sigma-ink/15 bg-white/70 px-7 py-3.5 text-base font-semibold text-sigma-ink backdrop-blur transition hover:bg-white"
              >
                Edit slides
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Deck overview */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold text-sigma-ink">
              {deck.title}
            </h2>
            <p className="mt-1 text-sm text-sigma-ink/60">
              {deck.slides.length} slides · {deck.weekOf ?? "this week"}
            </p>
          </div>
          <Link
            href="/edit"
            className="text-sm font-semibold text-sigma-orange hover:underline"
          >
            Edit deck →
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {deck.slides.map((slide, i) => {
            const member = slide.personKey ? getMember(slide.personKey) : null;
            return (
              <Link
                key={slide.id}
                href={`/present?slide=${i}`}
                className="group block"
              >
                <div className="overflow-hidden rounded-2xl border border-sigma-ink/10 bg-white shadow-card transition group-hover:-translate-y-1 group-hover:shadow-slide">
                  <SlideThumb document={slide.document} />
                </div>
                <div className="mt-2 flex items-center justify-between px-1">
                  <span className="text-sm font-semibold text-sigma-ink/80">
                    {member?.name ??
                      (slide.type === "TITLE"
                        ? "Title"
                        : slide.type === "SUMMARY"
                          ? "Team summary"
                          : slide.type === "THANKYOU"
                            ? "Thank you"
                            : `Slide ${i + 1}`)}
                  </span>
                  <span className="text-xs font-medium text-sigma-ink/40">
                    {i + 1}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <footer className="border-t border-sigma-ink/10 py-8 text-center text-sm text-sigma-ink/50">
        Sigma Presentation Studio · made for the Sigma Lending dev team
      </footer>
    </main>
  );
}
