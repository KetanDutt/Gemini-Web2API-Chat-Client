import {
  Code2,
  Lightbulb,
  ListChecks,
  MessageCircleQuestion,
  Sparkles,
} from "lucide-react";
import { GemMark } from "@/components/layout/Logo";
import { useUI } from "@/stores/uiStore";
import { useConnection } from "@/stores/connectionStore";
import { WifiOff } from "lucide-react";

const SUGGESTIONS = [
  {
    icon: MessageCircleQuestion,
    title: "Explain something",
    prompt: "Explain how ",
    hint: "Clear explanations at any depth",
  },
  {
    icon: Code2,
    title: "Write code",
    prompt: "Write a TypeScript function that ",
    hint: "Snippets, reviews, refactors",
  },
  {
    icon: Lightbulb,
    title: "Analyze an idea",
    prompt:
      "Analyze this idea and give me the strongest arguments for and against it:\n\n",
    hint: "Pros, cons, blind spots",
  },
  {
    icon: ListChecks,
    title: "Help me plan",
    prompt: "Help me plan ",
    hint: "Steps, timelines, priorities",
  },
  {
    icon: Sparkles,
    title: "Brainstorm with me",
    prompt: "Brainstorm 10 creative ideas for ",
    hint: "Divergent, playful thinking",
  },
];

export function WelcomeScreen() {
  const insert = useUI((s) => s.insertIntoComposer);
  const openDialog = useUI((s) => s.openDialog);
  const state = useConnection((s) => s.state);

  return (
    <div className="enter-rise mx-auto flex min-h-full w-full max-w-3xl flex-col px-2 sm:px-4">
      <div className="my-auto flex w-full flex-col items-center py-8 sm:py-10">
        <div className="glass-md mb-5 flex h-14 w-14 items-center justify-center rounded-(--radius-lg) sm:mb-6 sm:h-16 sm:w-16">
          <GemMark size={36} className="relative z-1" />
        </div>
        <h1 className="welcome-title text-center">How can I help today?</h1>
        <p className="mt-2 text-center text-[15px] text-fg-muted">
          Your private Gemini workspace — everything stays on this device.
        </p>

        {(state === "offline" || state === "error") && (
          <button
            onClick={() => openDialog("settings", "api")}
            className="pill pill-danger pill-interactive enter-pop mt-5 h-8 px-3.5 text-[13px]"
          >
            <WifiOff size={14} />
            Web2API is offline — check the connection
          </button>
        )}

        <div className="mt-8 grid w-full grid-cols-2 gap-2 sm:mt-9 sm:gap-2.5 lg:grid-cols-3">
          {SUGGESTIONS.map((s, i) => (
            <button
              key={s.title}
              onClick={() => insert(s.prompt)}
              className="glass-sm surface-hover card-hover enter-rise group flex flex-col items-start gap-2 rounded-(--radius-lg) p-3.5 text-left active:scale-[0.99] sm:gap-2.5 sm:p-4"
              style={{ animationDelay: `${80 + i * 45}ms` }}
            >
              <span className="relative z-1 flex h-8 w-8 items-center justify-center rounded-(--radius-sm) bg-accent-soft text-accent transition-transform duration-(--duration-base) ease-(--ease-spring) group-hover:scale-105">
                <s.icon size={16} />
              </span>
              <span className="relative z-1 text-[13.5px] font-medium sm:text-[14px]">
                {s.title}
              </span>
              <span className="relative z-1 text-[12px] text-fg-subtle sm:text-[12.5px]">
                {s.hint}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
