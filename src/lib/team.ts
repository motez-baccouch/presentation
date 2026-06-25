// The Sigma dev team roster. `key` is the lowercase handle used in Slack
// (`/presentation <key> ...`) and stored on PERSON slides as `personKey`.

export type AvatarSide = "left" | "right";
export type SlideBg = "cream" | "mesh";

export interface PersonStyle {
  avatar: AvatarSide;
  bg: SlideBg;
}

export interface TeamMember {
  key: string;
  name: string;
  role: string; // default role line; AI/editor can override per week
  avatar: string; // path under /public
  accent: string; // brand accent used on their slide
  style: PersonStyle; // each teammate gets their own look
  /** alternate spellings Slack users might type */
  aliases?: string[];
}

export const TEAM: TeamMember[] = [
  {
    key: "ali",
    name: "Ali Jbara",
    role: "Task Specs & Code Review",
    avatar: "/avatars/ali.png",
    accent: "#f79009",
    style: { avatar: "right", bg: "cream" },
    aliases: ["alijbara", "jbara"],
  },
  {
    key: "wael",
    name: "Wael Houry",
    role: "The Machine Learning Model Guy",
    avatar: "/avatars/wael.png",
    accent: "#f4691e",
    style: { avatar: "left", bg: "mesh" },
    aliases: ["waelhoury", "houry"],
  },
  {
    key: "maytham",
    name: "Maytham Ghaly",
    role: "A.K.A. The Open Banking Guy",
    avatar: "/avatars/maytham.png",
    accent: "#fbbf09",
    style: { avatar: "right", bg: "mesh" },
    aliases: ["maythamghaly", "ghaly"],
  },
  {
    key: "nour",
    name: "Nour Cheour",
    role: "Backend Engineer",
    avatar: "/avatars/nour.png",
    accent: "#e8420e",
    style: { avatar: "left", bg: "cream" },
    aliases: ["nourcheour", "cheour"],
  },
  {
    key: "motez",
    name: "Motez Baccouch",
    role: "Full-Stack Engineer",
    avatar: "/avatars/motez.png",
    accent: "#f79009",
    style: { avatar: "right", bg: "cream" },
    aliases: ["motezbaccouch", "baccouch"],
  },
  {
    key: "hassan",
    name: "Hassan Al Itawi",
    role: "Backend Engineer",
    avatar: "/avatars/hassan.png",
    accent: "#f4691e",
    style: { avatar: "left", bg: "mesh" },
    aliases: ["hassanalitawi", "itawi", "alitawi"],
  },
  {
    key: "hayfa",
    name: "Hayfa Chouchene",
    role: "Software Engineer",
    avatar: "/avatars/hayfa.png",
    accent: "#fbbf09",
    style: { avatar: "right", bg: "mesh" },
    aliases: ["haifa", "hayfachouchene", "chouchene"],
  },
];

/** Resolve a free-text name (from Slack) to a roster member. */
export function findMember(input: string): TeamMember | undefined {
  const q = input.trim().toLowerCase().replace(/[^a-z]/g, "");
  if (!q) return undefined;
  return TEAM.find(
    (m) =>
      m.key === q ||
      m.name.toLowerCase().replace(/[^a-z]/g, "") === q ||
      m.name.toLowerCase().split(" ")[0] === q ||
      (m.aliases ?? []).some((a) => a === q),
  );
}

export function getMember(key: string): TeamMember | undefined {
  return TEAM.find((m) => m.key === key);
}
