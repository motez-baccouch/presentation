import { SlideType } from "./types";
import { TEAM } from "./team";
import {
  buildTitleSlide,
  buildPersonSlides,
  buildSummarySlide,
  buildThankYouSlide,
} from "./templates";
import { naiveCategorize, PersonUpdate } from "./summary-core";
import { formatToday } from "./date";

export interface SeedSlide {
  order: number;
  type: SlideType;
  personKey: string | null;
  document: ReturnType<typeof buildTitleSlide>;
}

// Real content lifted from the existing Sigma Lending weekly deck, keyed by
// roster handle. Used to seed the database / file store on first run.
const PERSON_CONTENT: Record<
  string,
  { role?: string; eyebrow?: string; bullets: string[] }
> = {
  ali: {
    bullets: [
      "Writing task specifications for upcoming work",
      "Reviewing code across the team's pull requests",
    ],
  },
  wael: {
    bullets: [
      "Fixes and improvements to edge cases in the categorization project, mostly around company transfers",
      "Updating categorization rules around directors and company flows",
      "New updates to Sherlock for report generation, speed, and info accuracy",
      "Code reviews",
    ],
  },
  maytham: {
    bullets: [
      "Finished the Open Banking PR and addressed Ali's requested changes",
      "Fixed a Plaid scenario where new connections had mismatched account/transaction IDs — now matching by transaction ID with a fingerprint fallback",
      "Added webhook handling for connections that switch back to the old flow before the webhook arrives",
      "OB PR is ready and in review with Ali, then merge & start the release",
    ],
  },
  nour: {
    bullets: [
      "Bank account verification step before document generation, with a warning dialog and manual-review fallback",
      "Director property details for homeowners (address, ownership type, value, balance) shown in the Application Portal",
      "Working on Postcoder address integration — prefilled fields plus automatic Credit Canary generation",
      "VRP Snipe: manual VRP payments from the portal with confirmation, real-time processing, and correct cashflow attribution",
    ],
  },
  motez: {
    bullets: [
      "Split-screen email preview/editor so underwriters can review and edit info-request emails before sending",
      "Skip duplicate Creditsafe report when one ran within 24h — reuses the recent report via an indexed lookup",
      "Auto-reject applications whose company bank isn't on the approved list",
      "Auto-reject applications with significant active CCJs (company > £7,500, directors > £5,000)",
      "Unify CompanyReport on company_number and store Creditsafe IDs, with a backfill migration",
    ],
  },
  hassan: {
    bullets: [
      "Addressing review for Broker Commission Management — links commission rates to broker groups, applied automatically by membership",
      "Addressing review for reconciliation of Open Banking vs Heron data — flags matches, differences, and missing transactions in a report",
    ],
  },
  hayfa: {
    eyebrow: "Our Newest Team Member",
    bullets: [
      "Delivered: Video Call template tab bringing the pre-disbursement call script onto the portal",
      "In review: Daily Application Report (two CSVs) plus display names for underwriters",
      "In review: third-party API usage tracking & cost dashboard",
      "In progress: optimizing the speed of querying huge backend logs",
    ],
  },
};

export function buildDefaultDeck(): SeedSlide[] {
  const slides: SeedSlide[] = [];
  let order = 0;
  const dateStr = formatToday();

  slides.push({
    order: order++,
    type: "TITLE",
    personKey: null,
    document: buildTitleSlide({ weekOf: "Weekly Update", dateStr }),
  });

  for (const member of TEAM) {
    const content = PERSON_CONTENT[member.key] ?? { bullets: [] };
    for (const document of buildPersonSlides(member, content)) {
      slides.push({
        order: order++,
        type: "PERSON",
        personKey: member.key,
        document,
      });
    }
  }

  // AI status board (seeded heuristically; regenerate with AI in-app / Slack).
  const updates: PersonUpdate[] = TEAM.map((m) => ({
    personKey: m.key,
    name: m.name,
    bullets: PERSON_CONTENT[m.key]?.bullets ?? [],
  })).filter((u) => u.bullets.length);
  slides.push({
    order: order++,
    type: "SUMMARY",
    personKey: null,
    document: buildSummarySlide(naiveCategorize(updates), dateStr),
  });

  slides.push({
    order: order++,
    type: "THANKYOU",
    personKey: null,
    document: buildThankYouSlide(),
  });

  return slides;
}

export const DEFAULT_TITLE = "Sigma Lending — Weekly Team Update";
