import { getPresentation } from "@/lib/db";
import { Editor } from "@/components/editor/Editor";

export const dynamic = "force-dynamic";

export default async function EditPage({
  searchParams,
}: {
  searchParams: Promise<{ slide?: string }>;
}) {
  const deck = await getPresentation();
  const { slide } = await searchParams;
  return <Editor initial={deck} startSlideKey={slide} />;
}
