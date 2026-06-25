import { getPresentation } from "@/lib/db";
import { Presenter } from "@/components/Presenter";

export const dynamic = "force-dynamic";

export default async function PresentPage({
  searchParams,
}: {
  searchParams: Promise<{ slide?: string }>;
}) {
  const deck = await getPresentation();
  const { slide } = await searchParams;
  const startIndex = slide ? parseInt(slide, 10) || 0 : 0;
  return <Presenter slides={deck.slides} startIndex={startIndex} />;
}
