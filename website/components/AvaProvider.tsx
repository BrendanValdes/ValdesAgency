"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Mic, PhoneOff, RotateCcw, X } from "lucide-react";
import { RetellWebClient } from "retell-client-js-sdk";
import styles from "./AvaProvider.module.css";

export interface AvaContext {
  intent?: "general" | "scheduling_alternative";
  timezone?: string;
  firstName?: string;
  businessName?: string;
  email?: string;
  phone?: string;
  selectedDate?: string;
}

interface AvaContextValue {
  openAva: (context?: AvaContext) => void;
  closeAva: () => void;
}

type CallState = "ready" | "connecting" | "listening" | "speaking" | "ended" | "error";

const AvaLauncherContext = createContext<AvaContextValue | null>(null);

export function useAva(): AvaContextValue {
  const value = useContext(AvaLauncherContext);
  if (!value) throw new Error("useAva must be used inside <AvaProvider>");
  return value;
}

export default function AvaProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [callState, setCallState] = useState<CallState>("ready");
  const [callContext, setCallContext] = useState<AvaContext>({ intent: "general" });
  const [errorMessage, setErrorMessage] = useState("");
  const clientRef = useRef<RetellWebClient | null>(null);
  const startingRef = useRef(false);
  const titleId = useId();

  const stopCall = useCallback(() => {
    startingRef.current = false;
    const client = clientRef.current;
    clientRef.current = null;
    if (client) {
      client.removeAllListeners();
      client.stopCall();
    }
  }, []);

  const openAva = useCallback((context: AvaContext = { intent: "general" }) => {
    stopCall();
    setCallContext({ intent: "general", ...context });
    setErrorMessage("");
    setCallState("ready");
    setIsOpen(true);
  }, [stopCall]);

  const closeAva = useCallback(() => {
    stopCall();
    setIsOpen(false);
    setCallState("ready");
  }, [stopCall]);

  const startCall = useCallback(async () => {
    if (startingRef.current || clientRef.current) return;
    startingRef.current = true;
    setCallState("connecting");
    setErrorMessage("");

    try {
      const response = await fetch("/api/retell/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: callContext }),
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        accessToken?: string;
        error?: string;
      };
      if (!response.ok || !payload.accessToken) {
        throw new Error(payload.error || "Ava is unavailable right now.");
      }

      const client = new RetellWebClient();
      clientRef.current = client;
      client.on("call_started", () => setCallState("listening"));
      client.on("call_ended", () => {
        clientRef.current = null;
        startingRef.current = false;
        setCallState("ended");
      });
      client.on("agent_start_talking", () => setCallState("speaking"));
      client.on("agent_stop_talking", () => setCallState("listening"));
      client.on("error", () => {
        clientRef.current = null;
        startingRef.current = false;
        setErrorMessage("The call could not connect. Check microphone access and try again.");
        setCallState("error");
      });

      await client.startCall({ accessToken: payload.accessToken });
      startingRef.current = false;
    } catch (error) {
      stopCall();
      setErrorMessage(error instanceof Error ? error.message : "Ava is unavailable right now.");
      setCallState("error");
    }
  }, [callContext, stopCall]);

  useEffect(() => {
    const handleOpen = (event: Event) => {
      openAva((event as CustomEvent<AvaContext>).detail);
    };
    window.addEventListener("valdes:ava-open", handleOpen);
    return () => window.removeEventListener("valdes:ava-open", handleOpen);
  }, [openAva]);

  useEffect(() => () => stopCall(), [stopCall]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeAva();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [closeAva, isOpen]);

  const isLive = callState === "listening" || callState === "speaking" || callState === "connecting";
  const status = callState === "ready"
    ? "Your private voice concierge"
    : callState === "connecting"
      ? "Connecting…"
      : callState === "listening"
        ? "Listening…"
        : callState === "speaking"
          ? "Speaking…"
          : callState === "ended"
            ? "Call ended"
            : "Connection interrupted";

  return (
    <AvaLauncherContext.Provider value={{ openAva, closeAva }}>
      {children}
      <button className={styles.launcher} type="button" onClick={() => openAva()} aria-label="Talk to Ava live">
        <span className={styles.launcherPulse} aria-hidden="true" />
        <span><small>AVA</small><strong>Talk live</strong></span>
      </button>
      {isOpen && (
        <div className={styles.scrim} onMouseDown={(event) => event.target === event.currentTarget && closeAva()}>
          <section className={styles.panel} role="dialog" aria-modal="true" aria-labelledby={titleId}>
            <button className={styles.close} type="button" onClick={closeAva} aria-label="Close Ava"><X size={18} /></button>
            <header>
              <p className={styles.brand}>Valdes Agency</p>
              <h2 id={titleId}>Ava</h2>
              <p className={styles.role}>AI Virtual Assistant</p>
              <p className={styles.introduction}>
                {callContext.intent === "scheduling_alternative"
                  ? "Let’s find an appointment time that works better for you."
                  : "Ask a question, explore where AI could fit in your business, or talk through what you’re trying to improve."}
              </p>
              {callContext.intent === "scheduling_alternative" && (
                <p className={styles.context}>Finding another appointment time{callContext.firstName ? ` for ${callContext.firstName}` : ""}</p>
              )}
            </header>
            <div className={`${styles.voiceStage} ${isLive ? styles.live : ""} ${callState === "speaking" ? styles.speaking : ""}`}>
              <div className={styles.orbit} aria-hidden="true"><i /><i /><i /></div>
              <div className={styles.voiceMark} aria-hidden="true"><span /><span /><span /><span /><span /></div>
              <strong>{callState === "ready" ? "Ready when you are" : status}</strong>
              <p>{callState === "ready" ? "A short, live conversation. Your microphone will only be used during the call." : callState === "listening" ? "Go ahead — Ava can hear you." : callState === "speaking" ? "Ava is responding." : callState === "connecting" ? "Securing your voice session." : callState === "ended" ? "Thanks for speaking with Ava." : errorMessage}</p>
            </div>
            <footer>
              {isLive ? (
                <button type="button" className={styles.endButton} onClick={() => { stopCall(); setCallState("ended"); }}><PhoneOff size={17} /> End call</button>
              ) : (
                <button type="button" className={styles.startButton} onClick={startCall}>
                  {callState === "error" || callState === "ended" ? <RotateCcw size={17} /> : <Mic size={17} />}
                  {callState === "error" || callState === "ended" ? "Call Ava again" : "Start conversation"}
                </button>
              )}
            </footer>
          </section>
        </div>
      )}
    </AvaLauncherContext.Provider>
  );
}

declare global {
  interface WindowEventMap {
    "valdes:ava-open": CustomEvent<AvaContext>;
  }
}
