import type { SlideDeck } from "./slides";

export type BoardShape = "rectangle" | "circle" | "diamond" | "arrow";
export type BlockKind = "text" | "equation" | "sticky" | "connector" | BoardShape;
export type BoardPoint = [number, number];
export type BoardShapeSize = { width: number; height: number };
export type ConnectorEnd = { point: BoardPoint; objectId?: string; side?: "left" | "right" | "top" | "bottom" };
export type BoardConnector = { from: ConnectorEnd; to: ConnectorEnd; color?: string; dashed?: boolean; head?: boolean };
export type StickyStyle = { color?: "yellow" | "pink" | "blue" | "green"; bold?: boolean; align?: "left" | "center"; size?: "small" | "medium" | "large" };
export type BoardTextStyle = { bold?: boolean; fontFamily?: string; fontSize?: number; color?: string };
export type BoardTextRun = BoardTextStyle & { text: string };
export interface Block { id: string; topicId: string; kind: BlockKind; content: string; order: number; ts: number; position?: BoardPoint; stickyStyle?: StickyStyle; fontSize?: number; scale?: number; shapeSize?: BoardShapeSize; textWidth?: number; textRuns?: BoardTextRun[]; connector?: BoardConnector; attachedTo?: string; attachmentOrigin?: BoardPoint; surface?: string }
export interface Topic { id: string; title: string; summary: string; ts: number; auto: boolean; strokeIds?: string[]; inkAspect?: number }
export interface Stroke { id: string; pts: [number, number][]; color?: string; width?: number; opacity?: number; surface?: string }
export interface Archived { id: string; ts: number; blocks: Omit<Block, "ts" | "order">[]; strokes: Stroke[]; inkAspect?: number }
export interface RoomState {
  code: string; title: string; blocks: Block[]; topics: Topic[]; strokes: Stroke[];
  currentTopicId: string | null; ended: boolean; rev: number;
  studentStickyPermission?: string;
  collaborationId?: string;
  removedBlockPositions?: Record<string, BoardPoint>;
  spotlight?: { blockId: string; ts: number } | null;
  question?: { id: string; text: string; ts: number; open: boolean; answer?: string; correct?: number; total?: number } | null;
  subject?: string;
  archive?: Archived[];
  boardZoom?: number;
  slides?: SlideDeck;
  privateSlidePages?: SlideDeck["pages"];
  showSlides?: boolean;
  boardPosition?: [number, number];
}
export interface FeedbackEvent { id: string; sid: string; kind: "ask" | "confused" | "helped" | "answer"; blockId: string | null; topicId: string | null; ts: number; correct?: boolean; questionId?: string }
export type Mode = "standard" | "focus" | "guided" | "example";
export interface Prefs { mode: Mode; textSize: number; reduceMotion: boolean; popups: boolean; scores: Record<Mode, number> }
export const DEFAULT_PREFS: Prefs = { mode: "standard", textSize: 100, reduceMotion: false, popups: true, scores: { standard: 0, focus: 0, guided: 0, example: 0 } };
export type AIKind = "explain" | "why" | "simplify" | "example" | "snip" | "followup" | "another" | "summarize" | "catchup" | "deeper" | "clarify" | "graph" | "visual" | "quiz" | "recap";
export interface AIRequest {
  kind: AIKind; selected: string[]; context: string[]; topicTitle?: string; topics?: { title: string; summary: string }[];
  mode: Mode; image?: string; slide?: boolean; question?: string; history?: { role: "user" | "assistant"; text: string }[]; detail?: "short" | "long"; stats?: string;
}
export interface AIResponse { text: string; title?: string; summary?: string; newTopic?: boolean; data?: unknown; source: "ai" | "demo"; error?: string }
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
