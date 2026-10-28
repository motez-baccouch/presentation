import type {
  TextElement,
  ImageElement,
  VideoElement,
  ShapeElement,
} from "@/lib/types";
import type { LayerMove } from "./geometry";

/** A loose partial that can patch any element kind (type itself never changes). */
export type ElementPatch = Partial<Omit<TextElement, "type">> &
  Partial<Omit<ImageElement, "type">> &
  Partial<Omit<VideoElement, "type">> &
  Partial<Omit<ShapeElement, "type">>;

export type Patches = Record<string, ElementPatch>;

export type AlignEdge = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";

/** Selection-level commands shared by the canvas menu, Inspector and shortcuts. */
export interface EditorActions {
  copy: () => void;
  cut: () => void;
  paste: () => void;
  canPaste: boolean;
  duplicate: () => void;
  remove: () => void;
  selectAll: () => void;
  group: () => void;
  ungroup: () => void;
  toggleLock: () => void;
  layer: (move: LayerMove) => void;
  align: (edge: AlignEdge) => void;
  distribute: (axis: "h" | "v") => void;
}
