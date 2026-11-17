import { getSupabase } from "./supabase";

/**
 * Anonymous product metrics: which actions happen, how often. Never sends names, notes, questions or answers.
 * Needs `supabase/launch_readiness.sql`; silently does nothing if the table is missing or Supabase is not configured.
 */
export type TrackEvent = "room_open" | "room_join" | "ask" | "snip" | "checkin_post" | "checkin_answer" | "revisit" | "board_clear" | "recap" | "waitlist_view";
export type TrackRole = "teacher" | "student" | "visitor";

async function hashRoom(code: string): Promise<string> {
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`pacer-room:${code}`));
    return Array.from(new Uint8Array(buf)).slice(0, 6).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch { return "unknown"; }
}

export function track(event: TrackEvent, role: TrackRole, room?: string): void {
  try {
    if (typeof window === "undefined") return;
    const sb = getSupabase(); if (!sb) return;
    void (async () => {
      const room_hash = room ? await hashRoom(room) : null;
      await sb.from("usage_events").insert({ event, role, room_hash });
    })().catch(() => { /* metrics must never break the app */ });
  } catch { /* ignore */ }
}

/** Fire an event once per browser tab (e.g. joining a room). */
export function trackOnce(event: TrackEvent, role: TrackRole, room: string): void {
  try { const k = `pacer:tracked:${event}:${room}`; if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, "1"); } catch { /* ignore */ }
  track(event, role, room);
}
