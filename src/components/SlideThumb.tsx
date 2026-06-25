"use client";

import { StageScaler } from "./stage/StageScaler";
import { SlideView } from "./stage/SlideView";
import { SlideDocument } from "@/lib/types";

export function SlideThumb({
  document: doc,
  className = "",
}: {
  document: SlideDocument;
  className?: string;
}) {
  return (
    <StageScaler className={className} rounded>
      <SlideView document={doc} animate={false} />
    </StageScaler>
  );
}
