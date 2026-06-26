// The slide document model.
//
// Every slide renders onto a fixed 1280x720 (16:9) "stage". All element
// coordinates are absolute pixels within that stage; the stage is then
// CSS-scaled to fit whatever container it lives in (editor canvas, present
// mode, thumbnail). This single model powers editing AND playback.

export const STAGE_WIDTH = 1280;
export const STAGE_HEIGHT = 720;

export type SlideType =
  | "TITLE"
  | "PERSON"
  | "SUMMARY"
  | "THANKYOU"
  | "CUSTOM";

export type TextRole =
  | "eyebrow" // small uppercase label
  | "title" // big heading
  | "subtitle"
  | "role" // a person's role line
  | "bullet" // a task bullet
  | "body"
  | "number" // big index numeral
  | "footer";

export interface BaseElement {
  id: string;
  x: number;
  y: number;
  w: number;
  /** rotation in degrees (applied to the whole element) */
  rotation?: number;
  /** lower renders first (behind); also drives present-mode entrance order */
  z?: number;
  /** entrance animation in present mode */
  anim?: "fade" | "up" | "left" | "right" | "pop" | "none";
}

export interface TextElement extends BaseElement {
  type: "text";
  text: string;
  role: TextRole;
  fontFamily: string; // css font-family stack or var
  fontSize: number; // px on the 1280x720 stage
  fontWeight: number;
  color: string;
  align: "left" | "center" | "right";
  lineHeight?: number;
  letterSpacing?: number;
  italic?: boolean;
  uppercase?: boolean;
  /** optional fixed height; if absent the box auto-grows */
  h?: number;
}

export interface ImageElement extends BaseElement {
  type: "image";
  url: string;
  h: number;
  radius?: number; // border radius px
  shadow?: boolean;
  fit?: "cover" | "contain";
  /** render as a circle (used for avatars) */
  circle?: boolean;
}

export interface VideoElement extends BaseElement {
  type: "video";
  url: string;
  h: number;
  radius?: number;
  shadow?: boolean;
  autoplay?: boolean;
  loop?: boolean;
  muted?: boolean;
  controls?: boolean;
  poster?: string;
}

export type ShapeKind = "rect" | "triangle" | "blob" | "line";

export interface ShapeElement extends BaseElement {
  type: "shape";
  kind: ShapeKind;
  h: number;
  fill: string;
  radius?: number;
  opacity?: number;
}

export type SlideElement =
  | TextElement
  | ImageElement
  | VideoElement
  | ShapeElement;

export interface SlideBackground {
  kind: "solid" | "gradient" | "mesh";
  color?: string; // solid
  from?: string; // gradient
  to?: string;
  angle?: number; // gradient angle deg
}

export interface SlideDocument {
  background: SlideBackground;
  elements: SlideElement[];
  /**
   * For SUMMARY slides only: the structured status-board items this slide was
   * built from, so the shared/downloaded image can mirror the deck exactly
   * instead of re-deriving them heuristically.
   */
  summary?: SummaryItem[];
}

export interface SlideData {
  id: string;
  order: number;
  type: SlideType;
  personKey: string | null;
  document: SlideDocument;
}

export interface SlideTask {
  title: string;
  detail?: string;
  /** up to 4 short, plain-language bullet points anyone can understand */
  points?: string[];
}

export type SummaryStatus = "In Progress" | "In Review" | "Released";

export interface SummaryItem {
  personKey: string;
  label: string;
  status: SummaryStatus;
}

export interface PresentationData {
  id: string;
  title: string;
  weekOf: string | null;
  slides: SlideData[];
}

export const FONT_OPTIONS: { label: string; value: string }[] = [
  { label: "Poppins", value: "var(--font-display)" },
  { label: "Inter", value: "var(--font-sans)" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Courier", value: "'Courier New', monospace" },
  { label: "System", value: "system-ui, sans-serif" },
];

export const COLOR_SWATCHES = [
  "#1c1407",
  "#ffffff",
  "#fbbf09",
  "#f79009",
  "#f4691e",
  "#e8420e",
  "#6b5836",
  "#2f7d6b",
];
