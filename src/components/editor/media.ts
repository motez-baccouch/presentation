import { ImageElement, VideoElement, STAGE_WIDTH, STAGE_HEIGHT } from "@/lib/types";
import { genId } from "@/lib/templates";

export async function uploadFile(file: File): Promise<string | null> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(data.error ?? "Upload failed.");
    return null;
  }
  return data.url as string;
}

function naturalSize(url: string): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () =>
      resolve(
        img.naturalWidth && img.naturalHeight
          ? { w: img.naturalWidth, h: img.naturalHeight }
          : null,
      );
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

const CENTER = { x: STAGE_WIDTH / 2, y: STAGE_HEIGHT / 2 };

/** An image element at the picture's own aspect ratio, centred on `at`. */
export async function imageElementFor(
  url: string,
  at: { x: number; y: number } = CENTER,
): Promise<ImageElement> {
  const size = (await naturalSize(url)) ?? { w: 4, h: 3 };
  const fit = Math.min(520 / size.w, 400 / size.h, 1.5);
  const w = Math.round(size.w * fit);
  const h = Math.round(size.h * fit);
  return {
    id: genId(),
    type: "image",
    url,
    x: Math.round(at.x - w / 2),
    y: Math.round(at.y - h / 2),
    w,
    h,
    fit: "cover",
    radius: 16,
    shadow: true,
    anim: "pop",
    z: 8,
  };
}

export function videoElementFor(
  url: string,
  at: { x: number; y: number } = CENTER,
): VideoElement {
  return {
    id: genId(),
    type: "video",
    url,
    x: Math.round(at.x - 220),
    y: Math.round(at.y - 124),
    w: 440,
    h: 248,
    radius: 16,
    shadow: true,
    autoplay: true,
    loop: true,
    muted: true,
    controls: false,
    anim: "pop",
    z: 8,
  };
}
