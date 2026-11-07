"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

const MAX_SECONDS = 45;

/**
 * Records a voice note in the browser and sends it to be written down (brief P1). The words then
 * open the normal confirmation card, marked as voice, so nothing is saved without Confirm.
 */
export function VoiceButton() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "recording" | "reading" | "error">("idle");
  const [message, setMessage] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function start() {
    setMessage("");
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setState("error");
      setMessage("This phone's browser cannot record here. Please type the note.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setState("error");
      setMessage("Allow the microphone to record a voice note.");
      return;
    }
    const rec = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      if (timer.current) clearTimeout(timer.current);
      const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
      setState("reading");
      try {
        const r = await fetch("/api/voice", { method: "POST", headers: { "content-type": blob.type }, body: blob });
        const body = (await r.json()) as { text?: string; error?: string };
        if (!r.ok || !body.text) throw new Error(body.error ?? "I did not hear any words. Please try again.");
        router.push(`/record?voice=1&text=${encodeURIComponent(body.text.slice(0, 300))}`);
      } catch (err) {
        setState("error");
        setMessage(err instanceof Error ? err.message : "Could not read the voice note.");
      }
    };
    recorder.current = rec;
    rec.start();
    setState("recording");
    timer.current = setTimeout(() => rec.state === "recording" && rec.stop(), MAX_SECONDS * 1000);
  }

  const busy = state === "reading";
  return (
    <div id="voice" className="mt-3 scroll-mt-24">
      <button
        type="button"
        disabled={busy}
        onClick={() => (state === "recording" ? recorder.current?.stop() : start())}
        className={`w-full rounded-xl px-4 py-4 text-lg font-semibold ${state === "recording" ? "bg-red-700 text-white" : "border-2 border-emerald-700 bg-white text-emerald-800"} disabled:opacity-60`}
      >
        {state === "recording" ? "● Recording… tap to stop" : busy ? "Writing down what you said…" : "🎤 Say it instead"}
      </button>
      {message && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {message}
        </p>
      )}
    </div>
  );
}
