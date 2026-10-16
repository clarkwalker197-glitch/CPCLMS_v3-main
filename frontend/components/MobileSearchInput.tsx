"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Search, X } from "lucide-react";

interface SpeechRecognitionResultEvent extends Event {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

interface SpeechRecognitionLike {
  lang: string;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface MobileSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  storageKey: string;
  quickFilters?: string[];
}

type SpeechWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

export default function MobileSearchInput({
  value,
  onChange,
  placeholder,
  storageKey,
  quickFilters = [],
}: MobileSearchInputProps) {
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [focused, setFocused] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
      if (Array.isArray(saved)) setRecentSearches(saved.filter((item) => typeof item === "string").slice(0, 4));
    } catch {
      setRecentSearches([]);
    }
  }, [storageKey]);

  useEffect(() => {
    setVoiceSupported(
      "SpeechRecognition" in window || "webkitSpeechRecognition" in window,
    );
  }, []);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  const rememberSearch = (term: string) => {
    const nextTerm = term.trim();
    if (nextTerm.length < 2) return;
    const next = [nextTerm, ...recentSearches.filter((item) => item.toLowerCase() !== nextTerm.toLowerCase())].slice(0, 4);
    setRecentSearches(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Search remains usable when storage is unavailable.
    }
  };

  const startVoiceSearch = () => {
    const speechWindow = window as SpeechWindow;
    const SpeechRecognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    recognitionRef.current?.stop();
    const recognition = new SpeechRecognition();
    recognition.lang = navigator.language || "en-US";
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript;
      if (transcript) onChange(transcript.trim());
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    try {
      recognition.start();
    } catch {
      setListening(false);
    }
  };

  return (
    <div className="mobile-search-input relative w-full">
      <Search className="pointer-events-none absolute inset-y-0 left-3 my-auto h-5 w-5 text-zinc-500" aria-hidden="true" />
      <input
        ref={inputRef}
        type="text"
        enterKeyHint="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          rememberSearch(value);
          window.setTimeout(() => setFocused(false), 150);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") rememberSearch(value);
        }}
        placeholder={placeholder}
        className="min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 py-2.5 pl-10 pr-24 text-sm text-white placeholder:text-zinc-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <div className="absolute inset-y-0 right-1 flex items-center">
        {value && (
          <button type="button" onClick={() => { onChange(""); inputRef.current?.focus(); }} aria-label="Clear search" className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        )}
        <button type="button" onClick={startVoiceSearch} disabled={listening || !voiceSupported} aria-label={listening ? "Listening" : "Search by voice"} className="mobile-voice-search flex h-10 w-10 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white disabled:opacity-40">
          <Mic className={`h-4 w-4 ${listening ? "text-blue-400" : ""}`} />
        </button>
      </div>
      {quickFilters.length > 0 && (
        <div className="mobile-quick-filters mt-2 flex gap-2 overflow-x-auto pb-1">
          {quickFilters.map((filter) => (
            <button key={filter} type="button" onClick={() => { onChange(filter); rememberSearch(filter); }} className="min-h-9 shrink-0 rounded-full border border-zinc-700 bg-zinc-900 px-3 text-xs font-medium text-zinc-300 hover:border-blue-500/50 hover:text-white">
              {filter}
            </button>
          ))}
        </div>
      )}
      {focused && !value && recentSearches.length > 0 && (
        <div className="mobile-recent-searches absolute left-0 right-0 top-full z-40 mt-2 rounded-xl border border-zinc-700 bg-zinc-900 p-2 shadow-xl">
          <p className="px-2 py-1 text-xs font-medium text-zinc-500">Recent searches</p>
          {recentSearches.map((term) => (
            <button key={term} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(term); inputRef.current?.focus(); }} className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm text-zinc-300 hover:bg-zinc-800">
              <Search className="mr-2 h-4 w-4 shrink-0 text-zinc-500" />
              <span className="truncate">{term}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
