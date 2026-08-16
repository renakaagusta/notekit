import {
  Check,
  FileText,
  GitBranch,
  Link as LinkIcon,
  ListChecks,
  Lock,
  Search,
  Send,
  Smartphone,
  Sparkles,
} from "lucide-react";
import { useRef, useState } from "react";

/**
 * First-run mobile onboarding — a swipeable carousel that introduces NoteKit
 * before sign-in. Layout mirrors the Parchment/Daymark onboarding (mock preview
 * card → big title → subtitle → page dots → Back/Next), in NoteKit's own skin:
 * monochrome with green spent only on the primary action + active dot.
 *
 * Shown once (guarded by localStorage) on mobile before the SignIn screen, so a
 * first-time user learns what NoteKit is instead of landing cold on a login.
 */

const ONBOARDED_KEY = "nk:mobile-onboarded";

export function hasOnboarded(): boolean {
  try {
    return localStorage.getItem(ONBOARDED_KEY) === "1";
  } catch {
    return false;
  }
}
function markOnboarded() {
  try {
    localStorage.setItem(ONBOARDED_KEY, "1");
  } catch {
    /* ignore */
  }
}

type PageKey = "home" | "editor" | "ai" | "e2ee" | "sync";
interface Page {
  key: PageKey;
  title: string;
  subtitle: string;
}

const PAGES: Page[] = [
  {
    key: "home",
    title: "Everything in one place",
    subtitle:
      "Notes, tasks, links, and secrets — together in one calm place, not scattered across a dozen apps.",
  },
  {
    key: "editor",
    title: "Write, clean and fast",
    subtitle:
      "A focused editor with headings, lists, tables, and checkboxes. Everything saves as you type.",
  },
  {
    key: "ai",
    title: "Ask your notes",
    subtitle:
      "A built-in AI assistant that reads, writes, and organizes your notes — right where you work.",
  },
  {
    key: "e2ee",
    title: "Yours, end to end",
    subtitle:
      "End-to-end encrypted. Only your own devices hold the keys — never our servers.",
  },
  {
    key: "sync",
    title: "Synced, no lock-in",
    subtitle:
      "Backed by your own Git — plain files you can take anywhere, synced across every device.",
  },
];

interface OnboardingProps {
  onDone: () => void;
}

export function Onboarding({ onDone }: OnboardingProps) {
  const [page, setPage] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const isLast = page === PAGES.length - 1;

  function finish() {
    markOnboarded();
    onDone();
  }

  function goTo(next: number) {
    const clamped = Math.max(0, Math.min(PAGES.length - 1, next));
    const track = trackRef.current;
    if (track) {
      track.scrollTo({ left: clamped * track.clientWidth, behavior: "smooth" });
    }
    setPage(clamped);
  }

  function onScroll() {
    const track = trackRef.current;
    if (!track) return;
    const p = Math.round(track.scrollLeft / track.clientWidth);
    if (p !== page) setPage(p);
  }

  return (
    <div className="nk-onb">
      <header className="nk-onb-hd">
        <span className="nk-onb-brand">NoteKit</span>
        <button className="nk-onb-skip" onClick={finish}>
          Skip
        </button>
      </header>

      <div className="nk-onb-track" ref={trackRef} onScroll={onScroll}>
        {PAGES.map((p) => (
          <section className="nk-onb-page" key={p.key}>
            <div className="nk-onb-card">
              <MockContent page={p.key} />
            </div>
            <div className="nk-onb-copy">
              <h1>{p.title}</h1>
              <p>{p.subtitle}</p>
            </div>
          </section>
        ))}
      </div>

      <div className="nk-onb-dots" aria-hidden>
        {PAGES.map((p, i) => (
          <span key={p.key} className={`nk-onb-dot${i === page ? " is-on" : ""}`} />
        ))}
      </div>

      <div className="nk-onb-controls">
        <button
          className="nk-onb-back"
          onClick={() => goTo(page - 1)}
          disabled={page === 0}
        >
          Back
        </button>
        <button className="nk-onb-next" onClick={() => (isLast ? finish() : goTo(page + 1))}>
          {isLast ? "Get started" : "Next"}
        </button>
      </div>
    </div>
  );
}

/** Small CSS/lucide preview inside each page's card — no images. */
function MockContent({ page }: { page: PageKey }) {
  if (page === "home") {
    return (
      <div className="nk-onb-mock nk-onb-mock--home">
        <div className="nk-onb-mock-hd">
          <strong>Good evening</strong>
          <span>Wednesday, Aug 6</span>
        </div>
        <div className="nk-onb-mock-search">
          <Search size={14} aria-hidden /> Search…
        </div>
        <div className="nk-onb-mock-tiles">
          <div className="nk-onb-mock-cta nk-onb-mock-cta--note">New note</div>
          <div className="nk-onb-mock-cta nk-onb-mock-cta--task">New task</div>
        </div>
        <div className="nk-onb-mock-mini">
          <span><FileText size={13} aria-hidden /> Trading Overview</span>
          <span><ListChecks size={13} aria-hidden /> Review risk plan</span>
        </div>
      </div>
    );
  }
  if (page === "editor") {
    return (
      <div className="nk-onb-mock nk-onb-mock--editor">
        <div className="nk-onb-ed-h1">Weekly plan</div>
        <div className="nk-onb-ed-line" />
        <div className="nk-onb-ed-line short" />
        <div className="nk-onb-ed-check"><span className="box on"><Check size={11} aria-hidden /></span> Draft outline</div>
        <div className="nk-onb-ed-check"><span className="box" /> Publish notes</div>
        <div className="nk-onb-ed-line" />
        <div className="nk-onb-ed-line short" />
      </div>
    );
  }
  if (page === "ai") {
    return (
      <div className="nk-onb-mock nk-onb-mock--ai">
        <div className="nk-onb-bubble user">Summarize my trading notes</div>
        <div className="nk-onb-bubble ai">
          <Sparkles size={13} aria-hidden /> Here are the 3 key ideas…
        </div>
        <div className="nk-onb-tool"><Sparkles size={11} aria-hidden /> Reading 6 notes</div>
        <div className="nk-onb-composer">
          <span>Ask anything…</span>
          <span className="send"><Send size={13} aria-hidden /></span>
        </div>
      </div>
    );
  }
  if (page === "e2ee") {
    return (
      <div className="nk-onb-mock nk-onb-mock--e2ee">
        <div className="nk-onb-lock"><Lock size={30} aria-hidden /></div>
        <div className="nk-onb-devices">
          <span className="dev on"><Smartphone size={15} aria-hidden /> iPhone</span>
          <span className="dev on"><Smartphone size={15} aria-hidden /> Mac</span>
        </div>
        <div className="nk-onb-e2ee-note">Encrypted on your devices</div>
      </div>
    );
  }
  return (
    <div className="nk-onb-mock nk-onb-mock--sync">
      <div className="nk-onb-git"><GitBranch size={26} aria-hidden /></div>
      <div className="nk-onb-commits">
        <span><span className="node" /> note updated</span>
        <span><span className="node" /> task added</span>
        <span><span className="node" /> link saved</span>
      </div>
      <div className="nk-onb-sync-note"><LinkIcon size={12} aria-hidden /> Plain files, your Git</div>
    </div>
  );
}
