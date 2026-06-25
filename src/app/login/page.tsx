import Image from "next/image";
import Link from "next/link";
import { LoginForm } from "@/components/LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <main className="sigma-mesh flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm rounded-3xl border border-sigma-ink/10 bg-white/80 p-8 shadow-slide backdrop-blur">
        <Link href="/">
          <Image
            src="/brand/logo.svg"
            alt="Sigma"
            width={120}
            height={54}
            className="mb-6 h-8 w-auto"
          />
        </Link>
        <h1 className="font-display text-2xl font-bold text-sigma-ink">
          Editor access
        </h1>
        <p className="mt-1 mb-6 text-sm text-sigma-ink/60">
          Enter the shared team password to edit the deck.
        </p>
        <LoginForm next={next ?? "/edit"} />
      </div>
    </main>
  );
}
