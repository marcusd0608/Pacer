"use client";
import { ChoiceMenu } from "./ChoiceMenu";
import { AnimatedPanel } from "./AnimatedPanel";
import { SharedNotepads } from "./SharedNotepads";
import { CopyLinkButton } from "./CopyLinkButton";
import { TeacherSlidePreviews } from "./TeacherSlidePreviews";
import { StudentNotes } from "./StudentNotes";
import { privateNoteKey } from "@/lib/privateNoteKey";
import { boardRpc, useBoardCollaboration, usePrivateAnnotations } from "@/lib/useBoardCollaboration";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { askAI } from "@/lib/ai";
import { AIKind, Mode, RoomState, Stroke, uid, type Block, type BlockKind, type BoardShapeSize, type BoardTextRun } from "@/lib/types";
import { sharedState, useRoom } from "@/lib/useRoom";
import { usePrefs } from "@/lib/usePrefs";
import { AskPanel, Msg } from "./AskPanel";
import { CheckIn } from "./CheckIn";
import { ConceptColumn } from "./ConceptColumn";
import { checkinStats, computeRows, MIN_GROUP } from "@/lib/insights";
import { Insights } from "./Insights";
import { bump, loadProfile, loadStudy, mergeStudy, saveProfile, saveStudy, subjectOf, type Profile, type Stats, type StudyEntry } from "@/lib/profile";
import { ProfileSheet } from "./ProfileSheet";
import { mergeProfiles, pullLearning, pushProfile } from "@/lib/cloudProfile";
import { useAuth } from "@/lib/useAuth";
import { pushLesson, saveLesson } from "@/lib/lessons";
import { ArchiveSheet } from "./ArchiveSheet";
import { PostClassSheet } from "./PostClassSheet";
import { track, trackOnce } from "@/lib/track";
import { Logo } from "./Logo";
import { RichText } from "./RichText";
import { Popup, PopupData } from "./Popup";
import { SettingsSheet } from "./SettingsSheet";
import { Anchor, BoardTool, handwritingImage, Whiteboard } from "./Whiteboard";
import { BoardToolIcon } from "./BoardToolIcon";
import { BoardObjects } from "./BoardObjects";
import { saveLecture } from "@/lib/savedLectures";
import { captureSlide, publishSlide, slideUrl, type LocalSlide } from "@/lib/slides";
import { importLecture, lectureFormats, recoverDeck, rememberDeck } from "@/lib/importLecture";
import { backUpSlide, restoreSlide, saveTeacherRoom, shareStoredSlide, teacherStorageEnabled } from "@/lib/teacherStorage";

const INK_COLORS = [
  ["Black", "#17202a"], ["Blue", "#1565c0"], ["Red", "#c62828"], ["Green", "#087443"], ["Purple", "#6936a1"],
];
const HIGHLIGHT_COLORS = [
  ["Yellow", "#facc15"], ["Blue", "#38bdf8"], ["Pink", "#f472b6"], ["Green", "#4ade80"],
];
const BOARD_TOOLS: [BoardTool, string][] = [["select", "Select"], ["pen", "Pen"], ["highlight", "Highlight"], ["erase", "Eraser"]];

export function Classroom({ code }: { code: string }) {
  const sp = useSearchParams();
  const wantTeacher = sp.get("role") === "teacher";
  const { user, ready: authReady, signIn, enabled: signInEnabled } = useAuth();
  const { state, events, status, isTeacher, mutate, sendEvent, submitAnswer, grades, connected, transportKind, getState } = useRoom(code, wantTeacher, user?.id);
  const { prefs, update, reset, score } = usePrefs();
  const boardRef = useRef<HTMLDivElement>(null);
  const localSlides = useRef<{ id: string; pages: LocalSlide[] } | undefined>(undefined);
  const [studentSelection, setStudentSelection] = useState<{ deckId: string; page: number }>();
  const [slideBusy, setSlideBusy] = useState(false);
  const slideChangePending = useRef(false);
  const slideHistory = useRef<Record<string, { undo: Stroke[][]; redo: Stroke[][] }>>({});
  const [slideError, setSlideError] = useState("");
  const [teacherStorageError, setTeacherStorageError] = useState("");
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const deck = state?.slides;
  const studentSlide = studentSelection?.deckId === deck?.id ? studentSelection?.page : undefined;
  const slideNumber = deck && (!isTeacher && studentSlide && deck.pages[studentSlide] ? studentSlide : deck.current);
  const slidePage = state?.showSlides && slideNumber ? deck?.pages[slideNumber] : undefined;
  const slideInk = slideNumber ? deck?.ink[slideNumber] ?? [] : [];
  const currentSlideHistory = slidePage && slideHistory.current[slidePage.id];
  const availableSlides = deck ? Object.keys(deck.pages).map(Number).sort((a, b) => a - b) : [];
  const availableIndex = slideNumber ? availableSlides.indexOf(slideNumber) : -1;
  const previousSlide = isTeacher && slideNumber ? slideNumber - 1 : availableSlides[availableIndex - 1];
  const nextSlide = isTeacher && slideNumber ? slideNumber + 1 : availableSlides[availableIndex + 1];
  const localUploads = process.env.NODE_ENV === "development";
  const uploadEnabled = localUploads || (teacherStorageEnabled && !!user);
  const studentNotesKey = privateNoteKey(code, user?.id);
  const checkInKey = `pacer:check-in:${code}:${user?.id ?? "guest"}:${state?.question?.id}`;
  useEffect(() => { setAnchor(null); setSnip(false); }, [slidePage?.id]);

  const changeSlide = async (pageNumber: number, access = deck?.access ?? "presented", file?: File) => {
    if (slideChangePending.current || !isTeacher || !getState() || getState()?.ended || (file && !uploadEnabled)) return;
    slideChangePending.current = true;
    setSlideBusy(true);
    setSlideError("");
    try {
      const imported = file ? await importLecture(file) : undefined;
      const base = file && imported ? { id: crypto.randomUUID(), name: file.name, total: imported.length,
        current: 1, access, presented: [], pages: {}, ink: {} } : deck;
      if (!base) return;
      const numbers = access === "all" ? Array.from({ length: base.total }, (_, i) => i + 1) : [pageNumber];
      const pages = { ...base.pages } as NonNullable<typeof deck>["pages"];
      let sources = imported ?? (localSlides.current?.id === base.id ? localSlides.current.pages : undefined);
      for (const n of numbers) {
        if (pages[n]) continue;
        sources ??= await recoverDeck(base.id).catch(() => undefined);
        const saved = getState()?.privateSlidePages?.[n];
        const source = sources?.[n - 1] ?? (teacherStorageEnabled && userId && saved ? await restoreSlide(userId, base.id, saved) : undefined);
        if (!source) throw new Error("Upload the original material again to open unpublished pages.");
        if (localUploads) pages[n] = await publishSlide(source);
        else if (userId && teacherStorageEnabled) pages[n] = await shareStoredSlide(userId, base.id, source);
        else throw new Error("Sign in with teacher slide storage enabled to present this page.");
      }
      if (sources) localSlides.current = { id: base.id, pages: sources };
      if (imported) await rememberDeck(base.id, imported).catch(() => {});
      if (getState()?.ended) return;
      setAnchor(null);
      const privateSlidePages = imported ? Object.fromEntries(imported.map(({ image, ...page }, i) => [i + 1, page])) : undefined;
      mutate((s) => ({ ...s, ...(privateSlidePages ? { privateSlidePages } : {}), showSlides: true, slides: {
        ...base, ink: !file && s.slides?.id === base.id ? s.slides.ink : base.ink,
        access, current: pageNumber, pages, presented: [...new Set([...base.presented, pageNumber])],
      } }));
      if (imported && teacherStorageEnabled && userId) {
        setTeacherStorageError("");
        void (async () => {
          for (const page of imported) {
            if (!localUploads && pages[pageNumber]?.id === page.id) continue;
            await backUpSlide(userId, base.id, page);
          }
        })().catch(() => setTeacherStorageError("Slide backup failed. The deck is still available in this browser."));
      }
    } catch (error) {
      setSlideError(error instanceof Error ? error.message : "Could not open these slides or notes. Try exporting them to PDF.");
    } finally {
      slideChangePending.current = false;
      setSlideBusy(false);
    }
  };

  const editSlideInk = (edit: (ink: Stroke[]) => Stroke[]) => {
    if (!slideNumber || !slidePage || getState()?.ended) return;
    const current = getState()?.slides?.ink[slideNumber] ?? [];
    const next = edit(current);
    if (next.length === current.length) return;
    const history = slideHistory.current[slidePage.id] ??= { undo: [], redo: [] };
    history.undo = [...history.undo.slice(-49), current];
    history.redo = [];
    mutate((s) => s.slides && !s.ended ? { ...s, slides: { ...s.slides, ink: {
      ...s.slides.ink, [slideNumber]: next,
    } } } : s);
  };

  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fed, setFed] = useState("");
  const [snip, setSnip] = useState(false);
  const [tool, setTool] = useState<BoardTool>("select");
  const [insertPanel, setInsertPanel] = useState<"shapes" | "templates">();
  const uploadInput = useRef<HTMLInputElement>(null);
  const [browsedTopicId, setBrowsedTopicId] = useState<string | null>(null);
  const [studentView, setStudentView] = useState<{ zoom: number; position?: [number, number] }>({ zoom: 1 });
  const boardZoom = state?.boardZoom ?? 1;
  const setBoardZoom = (value: number, position: [number, number] = [0, 0]) => {
    const zoom = Math.round(Math.min(2.5, Math.max(0.5, value)) * 100) / 100;
    const current = getState();
    if (current && (current.boardZoom !== zoom || (current.boardPosition?.[0] ?? 0) !== position[0] ||
        (current.boardPosition?.[1] ?? 0) !== position[1])) {
      mutate((s) => ({ ...s, boardZoom: zoom, boardPosition: position }));
    }
  };
  const [penColor, setPenColor] = useState(INK_COLORS[0][1]);
  const [highlightColor, setHighlightColor] = useState(HIGHLIGHT_COLORS[0][1]);
  const [penWidth, setPenWidth] = useState(3);
  const [highlightWidth, setHighlightWidth] = useState(14);
  const inkHistory = useRef<{ undo: Partial<Pick<RoomState, "blocks" | "strokes">>[]; redo: Partial<Pick<RoomState, "blocks" | "strokes">>[] }>({ undo: [], redo: [] });
  const [placement, setPlacement] = useState<Exclude<BlockKind, "connector">>();
  const [showInsights, setShowInsights] = useState(false);
  const [showFinish, setShowFinish] = useState(false);
  const [showRecap, setShowRecap] = useState(false);
  const [savingLecture, setSavingLecture] = useState(false);
  const [lectureMessage, setLectureMessage] = useState("");
  const [showPages, setShowPages] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showClassTools, setShowClassTools] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [chooseBoard, setChooseBoard] = useState(false);
  const [catchup, setCatchup] = useState<{ text: string; source: string } | null>(null);
  const [catchupLoading, setCatchupLoading] = useState(false);
  const [lastViewed, setLastViewed] = useState<string | null>(null);
  const [popup, setPopup] = useState<PopupData | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [spotSeen, setSpotSeen] = useState(0);
  const [profile, setProfile] = useState<Profile>({}); const [showProfile, setShowProfile] = useState(false);
  const seenQ = useRef<Set<string>>(new Set());
  const [connectorMode, setConnectorMode] = useState(false);
  const [annotationMode, setAnnotationMode] = useState(false);
  const [annotationVisible, setAnnotationVisible] = useState(true);
  const [attachTo, setAttachTo] = useState<{ id: string; position?: [number, number] }>();
  const collaborationId = state?.collaborationId;
  const collaboration = useBoardCollaboration(collaborationId, code, user?.id, isTeacher);
  const privateNotes = usePrivateAnnotations(collaborationId, user?.id, !isTeacher && collaboration.ready);
  const privateEditing = !isTeacher && !!user && annotationMode && privateNotes.ready;
  const annotationZoom = privateEditing ? studentView.zoom : boardZoom;
  const adjustAnnotationZoom = (zoom: number) => {
    if (privateEditing) setStudentView({ zoom });
    else setBoardZoom(zoom);
  };
  const chooseAnnotationTool = (value: BoardTool | "text" | "equation" | "sticky" | "connector" | "shapes" | "templates") => {
    if (!privateNotes.ready) return;
    if (!privateEditing) setStudentView({ zoom: boardZoom, position: state?.boardPosition });
    setAnnotationMode(true);
    setAnnotationVisible(true);
    setAttachTo(undefined);
    setSnip(false);
    setAnchor(null);
    setTool(value === "pen" || value === "highlight" || value === "erase" ? value : "select");
    setPlacement(value === "text" || value === "equation" || value === "sticky" ? value : undefined);
    setConnectorMode(value === "connector" && !(privateEditing && connectorMode));
    setInsertPanel(value === "shapes" || value === "templates" ? (open) => privateEditing && open === value ? undefined : value : undefined);
  };
  const leaveAnnotationMode = () => {
    setAnnotationMode(false);
    setAttachTo(undefined);
    setTool("select");
    setPlacement(undefined);
    setConnectorMode(false);
    setInsertPanel(undefined);
  };
  const editPrivateBlock = (id: string, changes: Partial<Block>) => {
    privateNotes.update((data) => ({ ...data, blocks: data.blocks.map((block) => block.id === id ? { ...block, ...changes } : block) }));
  };
  const addPrivateBlocks = (items: Partial<Block>[]) => {
    const ids = items.map(() => uid());
    privateNotes.update((data) => ({ ...data, blocks: [...data.blocks, ...items.map((item, index): Block => ({
      kind: "text", content: "", ...item, id: ids[index], topicId: state?.currentTopicId ?? "",
      order: data.blocks.length + index, ts: Date.now(), surface: slidePage?.id,
    }))] }));
    return ids[0];
  };
  useEffect(() => {
    if (!isTeacher || !user || !state || state.collaborationId) return;
    const id = crypto.randomUUID();
    mutate((room) => ({ ...room, collaborationId: room.collaborationId ?? id, studentStickyPermission: undefined }));
  }, [isTeacher, user, state, mutate]);
  useEffect(() => {
    if (!isTeacher || !user || !collaborationId || !collaboration.ready || !state) return;
    const timer = window.setTimeout(() => {
      void boardRpc("pacer_save_board_snapshot", { board: collaborationId, state: sharedState(state), rev: state.rev }).catch(() => {});
    }, state.ended ? 0 : 400);
    return () => window.clearTimeout(timer);
  }, [isTeacher, user, collaborationId, collaboration.ready, state]);
  const userId = user?.id;
  useEffect(() => {
    if (!teacherStorageEnabled || !userId || !isTeacher || !state) return;
    let active = true;
    const timer = setTimeout(() => {
      void saveTeacherRoom(state).catch(() => {
        if (active) setTeacherStorageError("Room backup failed. Changes are still saved in this browser.");
      });
    }, 800);
    return () => { active = false; clearTimeout(timer); };
  }, [isTeacher, state, userId]);
  const [study, setStudy] = useState<StudyEntry[]>([]);
  const [syncedUser, setSyncedUser] = useState<string | null>(null);
  const [syncError, setSyncError] = useState(false);
  const profileWrites = useRef(Promise.resolve());
  const currentAccount = useRef(userId);
  currentAccount.current = userId;
  const [qText, setQText] = useState(""); const [qAnswer, setQAnswer] = useState("");
  const lastPopup = useRef(0); const prevTopics = useRef<number | null>(null);
  const sumTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const inkTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reviewedInk = useRef<string | undefined>(undefined);
  useEffect(() => () => clearTimeout(inkTimer.current), [code]);

  const live = state?.currentTopicId ?? state?.topics[state.topics.length - 1]?.id ?? null;
  const focus = prefs.mode === "focus" && !isTeacher;
  const browseTopic = !isTeacher && browsedTopicId !== null;
  const browsedTopic = browseTopic ? state?.topics.find((t) => t.id === browsedTopicId) : undefined;
  const blocks = (state?.blocks ?? []).filter((b) => browseTopic ? b.topicId === browsedTopicId : !focus || b.topicId === live);
  const sharedNotepads: RoomState["blocks"] = collaboration.notes.map((note, index) => ({
    id: note.id, kind: "sticky", content: `${note.author}\n${note.body}`, order: index, ts: 0,
    topicId: live ?? "", position: [note.x, note.y], stickyStyle: { color: "blue" },
  }));
  const isPrivate = (id: string) => privateNotes.data.blocks.some((block) => block.id === id);
  useEffect(() => {
    if (!state || !privateNotes.ready) return;
    privateNotes.update((data) => {
      let changed = false;
      const next = data.blocks.map((note) => {
        if (!note.attachedTo || !note.position || !note.attachmentOrigin) return note;
        const liveTarget = state.blocks.find((block) => block.id === note.attachedTo);
        const target = liveTarget ? liveTarget.position : state.removedBlockPositions?.[note.attachedTo]
          ?? state.archive?.findLast((board) => board.blocks.some((block) => block.id === note.attachedTo))?.blocks.find((block) => block.id === note.attachedTo)?.position;
        if (!target || (target[0] === note.attachmentOrigin[0] && target[1] === note.attachmentOrigin[1])) return note;
        changed = true;
        return { ...note, attachmentOrigin: target, position: [
          note.position[0] + target[0] - note.attachmentOrigin[0],
          note.position[1] + target[1] - note.attachmentOrigin[1],
        ] as [number, number] };
      });
      return changed ? { ...data, blocks: next } : data;
    }, false);
  }, [state?.blocks, state?.removedBlockPositions, state?.archive, privateNotes.ready]);
  const topicInk = new Set(browsedTopic?.strokeIds);
  // New pen marks are visible immediately, even before AI has assigned them to a topic.
  const visibleInk = (state?.strokes ?? []).filter((stroke) => !browseTopic || browsedTopicId === live || topicInk.has(stroke.id));
  const topics = (state?.topics ?? []).filter((t) => !focus || t.id === live);
  const roleQ = isTeacher ? "?role=teacher" : "";

  // ---- teacher actions ----
  const startTopic = (clear: boolean) => {
    clearTimeout(inkTimer.current);
    reviewedInk.current = getState()?.strokes.at(-1)?.id;
    if (clear) inkHistory.current = { undo: [], redo: [] };
    const id = uid();
    mutate((s) => ({
      ...(clear ? archiveBoard(s, "all") : s),
      currentTopicId: id,
      topics: [...s.topics, { id, title: "New topic", summary: "", ts: Date.now(), auto: true }],
    }));
    setChooseBoard(false);
  };

  const scheduleSummary = useCallback((topicId: string) => {
    clearTimeout(sumTimers.current[topicId]);
    sumTimers.current[topicId] = setTimeout(async () => {
      const s = getState(); const tp = s?.topics.find((t) => t.id === topicId);
      if (!s || !tp || s.ended || s.currentTopicId !== topicId) return;
      const notes = s.blocks.filter((b) => b.topicId === topicId);
      const latest = notes.at(-1);
      if (!latest) return;
      try {
        const r = await askAI({ kind: "summarize", selected: notes.slice(-12).map((b) => b.content), context: notes.slice(-9, -1).map((b) => b.content), topicTitle: tp.title, mode: "standard" });
        const title = r.title;
        if (!title) return;
        mutate((st) => {
          if (st.ended || st.currentTopicId !== topicId || st.blocks.filter((b) => b.topicId === topicId).at(-1)?.id !== latest.id ||
              st.topics.find((t) => t.id === topicId) !== tp) return st;
          if (r.newTopic && notes.length > 1) {
            const id = uid();
            return { ...st, currentTopicId: id,
              topics: [...st.topics, { id, title, summary: r.summary ?? "", ts: latest.ts, auto: true }],
              blocks: st.blocks.map((b) => b.id === latest.id ? { ...b, topicId: id } : b) };
          }
          if (!tp.auto) return st;
          return { ...st, topics: st.topics.map((t) => t.id === topicId ? { ...t, title, summary: r.summary ?? "" } : t) };
        });
      } catch { /* keep placeholder */ }
    }, 1500);
  }, [getState, mutate]);

  const rememberBlocks = (current: RoomState) => {
    const history = inkHistory.current;
    history.undo = [...history.undo.slice(-49), { blocks: current.blocks }];
    history.redo = [];
  };
  const editBoardBlock = (id: string, changes: Partial<RoomState["blocks"][number]>) => {
    const current = getState();
    if (!current || current.ended || !current.blocks.some((block) => block.id === id)) return;
    rememberBlocks(current);
    mutate((room) => ({ ...room, blocks: room.blocks.map((block) => block.id === id ? { ...block, ...changes } : block) }));
  };
  const addBlock = (k: BlockKind, content: string, position: [number, number], textRuns?: BoardTextRun[], shapeSize?: BoardShapeSize) => {
    const s = getState(); if (!s || !content.trim()) return;
    const heading = k === "text" ? content.trim().match(/^(?:new topic|next topic|topic)\s*:\s*(.+)$/i)?.[1]?.trim() : undefined;
    let tid = s.currentTopicId; let tps = s.topics;
    if (!tid || (heading && s.blocks.some((b) => b.topicId === tid))) { tid = uid(); tps = [...tps, { id: tid, title: "New topic", summary: "", ts: Date.now(), auto: true }]; }
    const topicId = tid!;
    if (heading) tps = tps.map((t) => t.id === topicId ? { ...t, title: heading, auto: false } : t);
    const id = uid();
    rememberBlocks(s);
    mutate((st) => ({ ...st, topics: tps, currentTopicId: topicId, blocks: [...st.blocks, { id, topicId, kind: k, content, textRuns, position, shapeSize, order: st.blocks.length, ts: Date.now() }] }));
    if (!heading) scheduleSummary(topicId);
    return id;
  };

  const updateInk = (next: Stroke[]) => {
    const current = getState();
    if (!current || current.ended) return;
    const history = inkHistory.current;
    history.undo = [...history.undo.slice(-49), { strokes: current.strokes }];
    history.redo = [];
    mutate((s) => ({ ...s, strokes: next }));
  };

  const restoreInk = (direction: "undo" | "redo") => {
    const current = getState();
    if (!current || current.ended) return;
    if (slidePage && slideNumber && current.slides) {
      const history = slideHistory.current[slidePage.id];
      const next = history?.[direction].pop();
      if (!history || !next) return;
      history[direction === "undo" ? "redo" : "undo"].push(current.slides.ink[slideNumber] ?? []);
      mutate((room) => room.slides ? { ...room, slides: { ...room.slides, ink: { ...room.slides.ink, [slideNumber]: next } } } : room);
      return;
    }
    const history = inkHistory.current;
    const next = history[direction].pop();
    if (!next) return;
    history[direction === "undo" ? "redo" : "undo"].push(next.strokes ? { strokes: current.strokes } : { blocks: current.blocks });
    clearTimeout(inkTimer.current);
    mutate((s) => ({ ...s, ...next }));
  };

  const eraseInk = (ids: Set<string>) => {
    const strokes = getState()?.strokes;
    if (!strokes) return;
    const remaining = strokes.filter((stroke) => !ids.has(stroke.id));
    if (remaining.length !== strokes.length) updateInk(remaining);
  };

  const addStroke = (drawing: Omit<Stroke, "id">) => {
    const current = getState();
    if (!current || current.ended) return;
    const stroke = { ...drawing, id: uid() };
    updateInk([...current.strokes, stroke]);
    if (drawing.opacity !== undefined) return;
    clearTimeout(inkTimer.current);
    const topicId = getState()?.currentTopicId;
    inkTimer.current = setTimeout(async () => {
      const s = getState();
      if (!s || s.ended || s.currentTopicId !== topicId || s.strokes.filter((item) => item.opacity === undefined).at(-1)?.id !== stroke.id) return;
      const topic = s.topics.find((t) => t.id === topicId);
      const savedInk = new Set(s.topics.flatMap((item) => item.strokeIds ?? []));
      const prior = s.strokes.findLastIndex((item) => item.id === reviewedInk.current || savedInk.has(item.id));
      const ink = s.strokes.slice(prior + 1).filter((item) => item.opacity === undefined);
      const width = boardRef.current?.clientWidth ?? 0;
      const height = boardRef.current?.clientHeight ?? 0;
      const image = handwritingImage(ink, width, height);
      if (!image) return;
      try {
        const r = await askAI({ kind: "summarize", selected: [], image, topicTitle: topic?.title,
          context: [topic?.summary ?? "", ...s.blocks.filter((b) => b.topicId === topicId).slice(-8).map((b) => b.content)].filter(Boolean),
          mode: "standard" });
        const title = r.title;
        if (r.source !== "ai" || !title) return;
        const current = getState();
        if (!current || current.ended || current.currentTopicId !== topicId || current.strokes !== s.strokes ||
            current.blocks !== s.blocks || current.topics !== s.topics) return;
        reviewedInk.current = stroke.id;
        const strokeIds = ink.map((item) => item.id);
        const inkAspect = width / height;
        mutate((st) => {
          if (!topic || r.newTopic) {
            const id = uid();
            return { ...st, currentTopicId: id, topics: [...st.topics, { id, title, summary: r.summary ?? "", ts: Date.now(), auto: true, strokeIds, inkAspect }] };
          }
          return { ...st, topics: st.topics.map((t) => t.id === topicId ? {
            ...t, title: t.auto ? title : t.title, summary: r.summary ?? t.summary,
            strokeIds: [...new Set([...(t.strokeIds ?? []), ...strokeIds])], inkAspect,
          } : t) };
        });
      } catch { /* Keep the ink on the board when the AI provider is unavailable. */ }
    }, 4500);
  };

  // ---- student: private learning profile (this device only) ----
  const rec = (f: keyof Stats) => setProfile(bump(subjectOf(state?.title ?? "", state?.subject), f, userId));
  const recordStudy = (entry: StudyEntry) => {
    const entries = mergeStudy(loadStudy(userId), [entry]);
    saveStudy(entries, userId);
    if (currentAccount.current === userId) setStudy(entries);
  };
  useEffect(() => {
    if (!authReady || isTeacher) return;
    setSyncedUser(null);
    setSyncError(false);
    setProfile(loadProfile(userId));
    setStudy(loadStudy(userId));
    if (!userId) return;
    let active = true;
    void pullLearning(userId).then((remote) => {
      if (!active) return;
      const profile = mergeProfiles(loadProfile(userId), remote.profile);
      const study = mergeStudy(remote.study, loadStudy(userId));
      saveProfile(profile, userId); saveStudy(study, userId);
      setProfile(profile); setStudy(study); setSyncedUser(userId);
    }).catch(() => { if (active) setSyncError(true); });
    return () => { active = false; };
  }, [authReady, isTeacher, userId]);
  useEffect(() => {
    if (!userId || syncedUser !== userId || isTeacher) return;
    let active = true;
    profileWrites.current = profileWrites.current.then(async () => {
      if (!active) return;
      try { await pushProfile(userId, profile, study); if (active) setSyncError(false); }
      catch { if (active) setSyncError(true); }
    });
    return () => { active = false; };
  }, [profile, study, userId, syncedUser, isTeacher]);
  useEffect(() => {
    Object.entries(grades).forEach(([id, ok]) => { if (!seenQ.current.has(id)) { seenQ.current.add(id); rec(ok ? "checkRight" : "checkWrong"); } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grades]);

  // Save what was covered so the student can review it later from the dashboard.
  const lessonContent = useMemo(() => state && ({
    code: state.code, title: state.title, subject: state.subject, blocks: state.blocks,
    topics: state.topics, strokes: state.strokes, archive: state.archive, slides: state.slides,
  }), [state?.code, state?.title, state?.subject, state?.blocks, state?.topics, state?.strokes, state?.archive, state?.slides]);
  useEffect(() => {
    if (!authReady || isTeacher || wantTeacher || !lessonContent) return;
    const lesson = saveLesson(lessonContent, userId);
    if (!lesson || !userId) return;
    const timer = setTimeout(() => void pushLesson(userId, lesson).catch(() => setSyncError(true)), 800);
    return () => clearTimeout(timer);
  }, [lessonContent, authReady, isTeacher, wantTeacher, userId]);

  // ---- student: AI ----
  const selectedBlocks = (a: Anchor | null) => (a ? blocks.filter((b) => a.ids.includes(b.id)) : []);
  const ask = async (a: Anchor, k: AIKind, question?: string, guided?: boolean) => {
    track(a.source === "snip" ? "snip" : "ask", "student", code);
    if (!state) return;
    const sel = selectedBlocks(a); const tp = state.topics.find((t) => t.id === sel[0]?.topicId);
    const label: Record<AIKind, string> = { explain: "Explain this", why: "Why this step?", simplify: "Simplify", example: "Give an example", snip: "Explain in depth", followup: question ?? "", another: "Try another explanation", deeper: "More depth", catchup: "", summarize: "", clarify: "", graph: "Graph it", visual: "Visualize it", quiz: "Quiz me", recap: "" };
    const history = msgs.slice(-6).filter((m) => m.text.trim()).map((m) => ({ role: m.role, text: m.text })).filter((m, i, arr) => !(i === 0 && m.role === "assistant" && arr.length > 0));
    setMsgs((m) => [...m, { role: "user", text: guided ? "Step by step" : label[k] }]); setLoading(true); setError(""); setFed("");
    sendEvent("ask", sel[0]?.id ?? null, sel[0]?.topicId ?? null); rec("asks");
    recordStudy({ id: uid(), lecture: state.title, topic: tp?.title ?? state.topics.find((t) => t.id === live)?.title ?? state.title,
      question: question?.trim() || (guided ? "Step by step" : label[k]), ts: Date.now() });
    try {
      const r = await askAI({ kind: k, selected: a.slideText ? a.slideText.match(/[\s\S]{1,550}/g) ?? [] : sel.map((b) => b.content),
        context: a.slideTitle ? [] : state.blocks.map((b) => b.content), topicTitle: a.slideTitle ?? tp?.title, mode: guided ? "guided" : prefs.mode, question, history, image: a.image, slide: !!a.slideTitle });
      const view = (k === "graph" || k === "visual" || k === "quiz") && r.data ? { type: k, data: r.data } : undefined;
      setMsgs((m) => [...m, { role: "assistant", text: r.text, source: r.source, view }]);
    } catch (e) { setError(e instanceof Error ? `${e.message}.` : "Something went wrong."); }
    finally { setLoading(false); }
  };
  const openAnchor = (a: Anchor, auto?: AIKind) => {
    setAnchor(a); setMsgs([]); setError(""); setFed(""); setSnip(false);
    const first = blocks.find((b) => b.id === a.ids[0]); if (first) setLastViewed(first.topicId);
    if (auto && (a.ids.length || a.image)) void ask(a, auto);
  };
  const askAboutSlide = (selection?: Anchor) => {
    const element = boardRef.current;
    const image = element?.querySelector<HTMLImageElement>('img[alt="Lecture slide"]');
    if (!element || !image || !slidePage) return;
    const bounds = element.getBoundingClientRect(), media = image.getBoundingClientRect();
    const rect = selection?.rect;
    const crop = rect && {
      left: (bounds.left + rect.left - media.left) / media.width, top: (bounds.top + rect.top - media.top) / media.height,
      right: (bounds.left + rect.right - media.left) / media.width, bottom: (bounds.top + rect.bottom - media.top) / media.height,
    };
    const capture = captureSlide(image, slideInk, crop);
    if (!capture) return;
    openAnchor({ ids: [], source: "snip", rect: rect ?? { left: 12, top: 12, right: 12, bottom: 12 },
      image: capture, slideText: slidePage.text, slideTitle: `${deck?.name} · Slide ${slideNumber}` });
  };
  const feedback = (f: "helped" | "confused" | "another") => {
    if (!anchor) return; const sel = selectedBlocks(anchor)[0];
    if (f === "another") { void ask(anchor, "another"); return; }
    setFed(f); sendEvent(f, sel?.id ?? null, sel?.topicId ?? null); score(prefs.mode, f === "helped" ? 1 : -1); rec(f === "helped" ? "helped" : "confused");
    if (f === "confused" && state) {
      const topic = state.topics.find((t) => t.id === (sel?.topicId ?? live))?.title ?? state.title;
      const entry = { id: uid(), lecture: state.title, topic, ts: Date.now() };
      recordStudy(entry);
      void askAI({ kind: "followup", topicTitle: topic, selected: selectedBlocks(anchor).map((b) => b.content),
        context: [], image: anchor.image, mode: "standard",
        question: "I marked this material as confusing. Based only on the selected content, suggest one specific concept and one short practice step to review. Do not assume what I misunderstood." })
        .then((r) => { if (r.source === "ai" && r.text.trim()) recordStudy({ ...entry, suggestion: r.text.trim() }); })
        .catch(() => { /* The student's review flag remains saved. */ });
    }
  };
  const suggestion = (() => {
    const best = (Object.entries(prefs.scores) as [Mode, number][]).sort((a, b) => b[1] - a[1])[0];
    return best && best[1] > 0 && best[0] !== prefs.mode ? `Based on your taps, ${best[0]} mode may suit you. (This is a preference score, not a measure of understanding.)` : "";
  })();

  const openCatchup = async (detail: "short" | "long" = "short") => {
    if (!state) return; setCatchupLoading(true);
    const idx = state.topics.findIndex((t) => t.id === lastViewed);
    const t = state.topics.slice(idx + 1 || 0).map((x) => ({ title: x.title, summary: x.summary }));
    setCatchup((c) => c ?? { text: "", source: "demo" });
    try { const r = await askAI({ kind: "catchup", selected: [], context: state.blocks.map((b) => b.content), topics: t.length ? t : state.topics.map((x) => ({ title: x.title, summary: x.summary })), mode: prefs.mode, detail }); setCatchup({ text: r.text, source: r.source }); }
    catch { setCatchup({ text: "Couldn't load the catch-up. Try again.", source: "demo" }); }
    finally { setCatchupLoading(false); }
  };

  // ---- AI pop-ups (one at a time, cooldown, never over the board centre) ----
  const offer = useCallback((p: PopupData) => {
    if (!prefs.popups || popup || anchor || snip || state?.question?.open) return;
    const gap = prefs.mode === "focus" ? 75000 : 25000;
    if (Date.now() - lastPopup.current < gap) return;
    lastPopup.current = Date.now(); setPopup(p);
  }, [prefs.popups, prefs.mode, popup, anchor, snip, state?.question?.open]);
  useEffect(() => { if (anchor || snip) setPopup(null); }, [anchor, snip]);
  useEffect(() => { if (!popup) return; const t = setTimeout(() => setPopup(null), 15000); return () => clearTimeout(t); }, [popup]);
  useEffect(() => {
    if (isTeacher || !anchor || anchor.source !== "block" || msgs.length) return;
    const a = anchor; const t = setTimeout(() => offer({ id: uid(), text: "Want a simpler explanation of this step?", action: "Simplify it", run: () => void ask(a, "simplify") }), 8000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor, msgs.length, isTeacher]);
  useEffect(() => {
    if (!state || isTeacher) return;
    const n = state.topics.length;
    if (prevTopics.current !== null && n > prevTopics.current) {
      const t = state.topics[n - 1]; offer({ id: uid(), text: `New topic: "${t.title}". Want a quick catch-up?`, action: "Catch me up", run: () => void openCatchup() });
    }
    prevTopics.current = n;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.topics.length]);

  useEffect(() => { try { setDemoMode(localStorage.getItem("pacer:demo") === "1"); } catch { /* ignore */ } }, []);
  const roomLoaded = !!state;
  useEffect(() => { if (roomLoaded) trackOnce(isTeacher ? "room_open" : "room_join", isTeacher ? "teacher" : "student", code); }, [roomLoaded, isTeacher, code]);
  const toggleDemo = () => setDemoMode((v) => { const n = !v; try { localStorage.setItem("pacer:demo", n ? "1" : "0"); } catch { /* ignore */ } return n; });
  const postQuestion = () => {
    if (!qText.trim() || !qAnswer.trim()) return;
    const id = uid();
    try { localStorage.setItem(`pacer:key:${code}`, JSON.stringify({ id, answer: qAnswer.trim() })); } catch { /* ignore */ }
    mutate((s) => ({ ...s, question: { id, text: qText.trim(), ts: Date.now(), open: true } }));
    track("checkin_post", "teacher", code);
    setQText(""); setQAnswer("");
  };
  const closeQuestion = () => {
    let answer: string | undefined; try { answer = JSON.parse(localStorage.getItem(`pacer:key:${code}`) ?? "null")?.answer; } catch { /* ignore */ }
    const st = state ? checkinStats(state, events) : null;
    mutate((s) => ({ ...s, question: s.question ? { ...s.question, open: false, answer, correct: st?.correct ?? 0, total: st?.total ?? 0 } : null }));
  };
  /** Every clear first saves a copy of the board (notes + pen) to the archive, so students can still look back at it. */
  const archiveBoard = (s: RoomState, what: "pen" | "all"): RoomState => {
    if (!s.blocks.length && !s.strokes.length) return s;
    const board = boardRef.current;
    const inkAspect = board?.clientHeight ? board.clientWidth / board.clientHeight : undefined;
    const snap = { id: uid(), ts: Date.now(), blocks: s.blocks, strokes: s.strokes, inkAspect };
    return { ...s, archive: [...(s.archive ?? []), snap].slice(-20), strokes: [], blocks: what === "all" ? [] : s.blocks };
  };
  const clearBoard = (what: "pen" | "all") => {
    clearTimeout(inkTimer.current);
    inkHistory.current = { undo: [], redo: [] };
    track("board_clear", "teacher", code);
    mutate((s) => archiveBoard(s, what));
  };
  const revisit = (blockId: string) => { track("revisit", "teacher", code); mutate((s) => ({ ...s, spotlight: { blockId, ts: Date.now() } })); };
  const spotTs = state?.spotlight?.ts;
  useEffect(() => {
    const sp = state?.spotlight; if (!sp || isTeacher || browseTopic) return;
    boardRef.current?.querySelector(`[data-block-id="${sp.blockId}"]`)?.scrollIntoView({ block: "center", behavior: prefs.reduceMotion ? "auto" : "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spotTs, isTeacher]);

  // ---- render ----
  if (!state) {
    return (
      <main className="grid min-h-screen place-items-center p-6 text-center">
        <div>
          <Logo />
          {status === "notfound" ? (<><p className="mt-6 text-xl">We couldn&apos;t find meeting {code}.</p><p className="mt-1 text-smoke">Check the code, or ask your teacher whether the meeting has started.</p><Link className="btn btn-primary mt-6" href="/">Back to home</Link></>)
            : (<p className="mt-6 text-smoke" role="status">Connecting to meeting {code}…</p>)}
        </div>
      </main>
    );
  }

  const sel = selectedBlocks(anchor);
  const threshold = demoMode ? 1 : MIN_GROUP;
  const alerts = isTeacher ? computeRows(state, events).rows.filter((r) => r.unresolved >= threshold && !dismissed.includes(`${r.key}:${r.unresolved}`)) : [];
  const finishLecture = async (save: boolean) => {
    if (savingLecture) return;
    setSavingLecture(true);
    setLectureMessage("");
    try {
      if (collaborationId && collaboration.allowed) await boardRpc("pacer_set_contributions", { board: collaborationId, allowed: false });
      if (!save) {
        mutate((room) => ({ ...room, ended: true }));
        setShowFinish(false);
        return;
      }
      const destination = await saveLecture(getState() ?? state, events, userId);
      mutate((room) => ({ ...room, ended: true }));
      setLectureMessage(destination === "account" ? "Saved to your teaching profile." : "Saved in this browser.");
      setShowFinish(false);
    } catch (error) {
      setLectureMessage(error instanceof Error ? error.message : "Could not save the lecture.");
    } finally { setSavingLecture(false); }
  };
  const spot = state.spotlight && Date.now() - state.spotlight.ts < 180000 ? state.spotlight : null;
  const spotBlock = spot ? state.blocks.find((b) => b.id === spot.blockId) : undefined;
  const board = boardRef.current?.getBoundingClientRect();
  const joinUrl = typeof window !== "undefined" ? `${window.location.origin}/room/${code}` : "";
  const pill = status === "live" ? "Connected" : status === "waiting" ? "Waiting for teacher…" : "Connecting…";

  return (
    <div className="notebook relative flex min-h-dvh flex-col lg:h-dvh lg:overflow-clip" data-reduce-motion={prefs.reduceMotion}>
      <header className="notebook-header flex flex-wrap items-center gap-2 border-b px-3 py-2 md:gap-3 md:px-6 md:py-3">
        <Link href={isTeacher ? "/?view=teaching" : "/"} aria-label="Pacer home"
          onClick={(event) => { if (isTeacher && !state.ended) { event.preventDefault(); setShowFinish(true); } }}><Logo height={24} /></Link>
        <div className="min-w-0 flex-1 basis-[25%] border-l border-stone pl-2 text-base font-semibold md:basis-auto">
          <h1 className={isTeacher && !state.ended && titleDraft !== null ? "sr-only" : "truncate"}>
            {isTeacher && !state.ended && titleDraft === null ? (
              <button type="button" aria-label={`Rename lecture: ${state.title}`} title="Rename lecture"
                className="block max-w-full cursor-text truncate rounded-md border border-transparent px-1 py-0.5 text-left hover:border-stone focus-visible:border-stone"
                onClick={() => setTitleDraft(state.title)}>
                {state.title}
              </button>
            ) : state.title}
          </h1>
          {isTeacher && !state.ended && titleDraft !== null && (
            <input aria-label="Lecture title" size={Math.max(1, titleDraft.length)}
              className="min-w-[2ch] max-w-full rounded-md border border-sky bg-eggshell px-1 py-0.5 outline-none [field-sizing:content]"
              value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)}
              autoFocus onFocus={(event) => event.currentTarget.select()}
              onBlur={(event) => {
                const title = event.currentTarget.value.trim();
                if (title && title !== state.title) mutate((room) => room.ended ? room : { ...room, title });
                setTitleDraft(null);
              }}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                if (event.key === "Enter" || event.key === "Escape") {
                  event.preventDefault();
                  if (event.key === "Enter") event.currentTarget.blur();
                  else setTitleDraft(null);
                }
              }} />
          )}
        </div>
        <span className={`inline-flex items-center gap-2 rounded-lg px-2 py-1 text-xs md:px-3 ${state.ended ? "bg-taupe text-smoke" : isTeacher || status === "live" ? "notebook-live" : "bg-amber-50 text-amber-800"}`}>
          <span aria-hidden className={`size-2 rounded-full bg-current`} />
          {isTeacher ? `${state.ended ? "Ended" : "Live"} · ${connected} connected` : pill}
        </span>
        <div className="basis-full md:hidden" aria-hidden="true" />
        {isTeacher ? (
          <>
            <button className="btn btn-outline btn-sm" onClick={() => setShowRecap(true)}>Post-class package</button>
            <button className="btn btn-outline btn-sm notebook-accent-blue" aria-expanded={showInvite} onClick={() => setShowInvite((v) => !v)}>Invite · {code}</button>
            <button className={`btn btn-sm ${state.ended ? "btn-primary" : "btn-outline notebook-accent-rose"}`} onClick={() => setShowFinish(true)}>{state.ended ? "Save lecture" : "End lecture"}</button>
          </>
        ) : (
          <>
            <button className={`btn btn-sm ${snip ? "btn-primary" : "btn-outline"}`} aria-pressed={snip}
              onClick={() => {
                if (!snip) leaveAnnotationMode();
                setSnip(!snip);
                setAnchor(null);
              }}>Snip</button>
            <button className="btn btn-outline btn-sm" onClick={() => void openCatchup()}>Catch me up</button>
            {(browseTopic || studentSlide) && <button className="btn btn-primary btn-sm" onClick={() => {
              setBrowsedTopicId(null); setStudentSelection(undefined); setAnchor(null); setSnip(false);
            }}>Return to live</button>}
          </>
        )}
        <div className="ml-auto md:hidden">
          <button type="button" className="btn btn-outline btn-sm" aria-controls="classroom-more"
            aria-expanded={showClassTools} onClick={() => setShowClassTools((open) => !open)}>
            More{isTeacher && alerts.length ? ` (${alerts.length})` : ""}
          </button>
        </div>
        <div id="classroom-more" className={`${showClassTools ? "flex" : "hidden"} w-full flex-wrap items-center gap-2 rounded-xl bg-white/70 p-2 md:flex md:w-auto md:bg-transparent md:p-0`}>
          {!isTeacher && <div className="flex items-center gap-2 text-sm">
              Board view
              <ChoiceMenu label="Board view" value={browseTopic ? "browse" : "follow"}
                onChange={(value) => {
                  const current = getState();
                  setBrowsedTopicId(value === "browse" ? current?.currentTopicId ?? current?.topics.at(-1)?.id ?? null : null);
                  setStudentView({ zoom: 1 });
                  setAnchor(null);
                  setSnip(false);
                }}>
                <option value="follow">Follow teacher</option>
                <option value="browse" disabled={!live}>Browse topic notes</option>
              </ChoiceMenu>
            </div>}
          <button className="btn btn-outline btn-sm" onClick={() => { setShowClassTools(false); setShowArchive(true); }}>Board archive{state.archive?.length ? ` (${state.archive.length})` : ""}</button>
          {isTeacher ? <>
            <button className="btn btn-outline btn-sm" onClick={toggleDemo} aria-pressed={demoMode} title="Show insights in classes with only one or two students">Small class: {demoMode ? "on" : "off"}</button>
            <button className="btn btn-outline btn-sm notebook-accent-violet" onClick={() => { setShowClassTools(false); setShowInsights((v) => !v); }} aria-pressed={showInsights}>Insights{alerts.length ? ` (${alerts.length})` : ""}</button>
          </> : <>
            <button className="btn btn-outline btn-sm" onClick={() => { setShowClassTools(false); setShowProfile(true); }}>My profile</button>
            <button className="btn btn-outline btn-sm" onClick={() => { setShowClassTools(false); setShowSettings(true); }}>Mode: {prefs.mode}</button>
          </>}
        </div>
      </header>
      {transportKind === "local" && isTeacher && <p className="bg-taupe px-4 py-1 text-center text-xs text-smoke">Local classroom · Join from another tab in this browser.</p>}
      {state.ended && <p role="status" className="bg-ink px-4 py-2 text-center text-sm text-white">This lecture has ended.</p>}
      {isTeacher && !showFinish && lectureMessage && <p role="status" className="px-4 py-2 text-center text-sm">{lectureMessage} <Link href="/?view=teaching" className="underline">View saved lectures</Link></p>}
      <AnimatedPanel open={isTeacher && showFinish} motion="dialog" reduced={prefs.reduceMotion}>
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="finish-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            onKeyDown={(event) => { if (event.key === "Escape" && !savingLecture) setShowFinish(false); }}>
            <h2 id="finish-title" className="text-xl font-semibold">{state.ended ? "Save lecture" : "End lecture"}</h2>
            <p className="mt-2 text-sm text-smoke">Keep the notes, annotations, and anonymous class insights in your teaching dashboard.</p>
            {lectureMessage && <p role="status" className="mt-2 text-sm">{lectureMessage}</p>}
            <div className="mt-5 flex flex-wrap gap-2">
              <button autoFocus className="btn btn-primary btn-sm" disabled={savingLecture} onClick={() => void finishLecture(true)}>
                {savingLecture ? "Saving…" : state.ended ? "Save lecture" : "Save and end"}
              </button>
              {!state.ended && <button className="btn btn-outline btn-sm" disabled={savingLecture} onClick={() => void finishLecture(false)}>End without saving</button>}
              <button className="btn btn-outline btn-sm" disabled={savingLecture} onClick={() => setShowFinish(false)}>Cancel</button>
            </div>
          </section>
        </div>
      </AnimatedPanel>

      <AnimatedPanel open={showInvite && isTeacher} reduced={prefs.reduceMotion}>
        <div className="absolute right-4 top-16 z-40 w-[260px] rounded-[20px] border border-stone bg-eggshell p-4 text-center shadow-xl">
          <p className="text-xs text-smoke">Meeting code</p><p className="text-3xl font-light tracking-[0.2em]">{code}</p>
          <div className="mx-auto my-3 w-fit rounded-xl border border-stone bg-white p-2"><QRCodeSVG value={joinUrl} size={140} /></div>
          <input aria-label="Meeting link" className="input mb-2 text-xs" readOnly value={joinUrl} onFocus={(event) => event.currentTarget.select()} />
          <CopyLinkButton key={joinUrl} link={joinUrl} />
        </div>
      </AnimatedPanel>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {!isTeacher && privateNotes.ready && <nav aria-label="Private annotation tools"
          className="notebook-rail flex shrink-0 gap-2 overflow-x-auto p-2 lg:w-max lg:flex-col lg:overflow-y-auto">
          <div className="notebook-tool-group">
            <button type="button" className="notebook-tool" aria-label="Edit my annotations" title="Edit my annotations"
              aria-pressed={privateEditing} disabled={!privateNotes.ready}
              onClick={() => privateEditing ? leaveAnnotationMode() : chooseAnnotationTool("select")}>
              <BoardToolIcon tool="sticky" />Annotate
            </button>
            <button type="button" className="notebook-tool" aria-label={annotationVisible ? "Hide annotations" : "Show annotations"}
              title={annotationVisible ? "Hide annotations" : "Show annotations"} disabled={!privateNotes.ready}
              onClick={() => { if (annotationVisible) leaveAnnotationMode(); setAnnotationVisible(!annotationVisible); }}>
              <BoardToolIcon tool={annotationVisible ? "visibility" : "hidden"} />{annotationVisible ? "Hide" : "Show"}
            </button>
          </div>
          <div className="notebook-tool-group">
            {BOARD_TOOLS.map(([value, label]) => <button key={value} type="button" className="notebook-tool" data-tool={value}
              aria-label={label} title={label} disabled={!privateNotes.ready}
              aria-pressed={privateEditing && !placement && tool === value} onClick={() => chooseAnnotationTool(value)}>
              <BoardToolIcon tool={value} />{value === "highlight" ? "Highlight" : label}
            </button>)}
          </div>
          <div className="notebook-tool-group">
            {(["text", "equation", "sticky"] as const).map((value) => <button key={value} type="button" className="notebook-tool capitalize"
              data-tool={value} aria-pressed={privateEditing && placement === value} disabled={!privateNotes.ready}
              onClick={() => chooseAnnotationTool(value)}>
              <BoardToolIcon tool={value} />{value}
            </button>)}
            {(["shapes", "templates"] as const).map((value) => <button key={value} type="button" className="notebook-tool capitalize"
              data-tool={value} aria-expanded={privateEditing && insertPanel === value} disabled={!privateNotes.ready}
              onClick={() => chooseAnnotationTool(value)}>
              <BoardToolIcon tool={value} />{value}
            </button>)}
            <button type="button" className="notebook-tool" aria-pressed={privateEditing && connectorMode}
              disabled={!privateNotes.ready} onClick={() => chooseAnnotationTool("connector")}>
              <BoardToolIcon tool="arrow" />Connector
            </button>
          </div>
          <div className="notebook-tool-group">
            {(["undo", "redo"] as const).map((action) => <button key={action} type="button" className="notebook-tool capitalize"
              disabled={!privateEditing || !privateNotes.canRestore(action)} onClick={() => privateNotes.restore(action)}>
              <BoardToolIcon tool={action} />{action}
            </button>)}
          </div>
        </nav>}
        {isTeacher && !state.ended && (
          <nav aria-label="Teacher whiteboard tools" className="notebook-rail flex shrink-0 gap-2 overflow-x-auto p-2 lg:w-max lg:flex-col lg:overflow-y-auto">
            <div className="notebook-tool-group">
            {BOARD_TOOLS.map(([value, label]) => <button key={value} type="button" className="notebook-tool"
              aria-label={label} title={label} data-tool={value}
              aria-pressed={!placement && !connectorMode && tool === value} onClick={() => { setConnectorMode(false); setTool(value); setInsertPanel(undefined); setPlacement(undefined); }}><BoardToolIcon tool={value} />{value === "highlight" ? "Highlight" : label}</button>)}
            </div>
            <div className="notebook-tool-group">
                {(["text", "equation", "sticky"] as const).map((value) => <button key={value} type="button" className="notebook-tool"
                  data-tool={value}
                  aria-pressed={placement === value}
                  onClick={() => { if (slidePage) mutate((room) => ({ ...room, showSlides: false })); setConnectorMode(false); setTool("select"); setInsertPanel(undefined); setPlacement((current) => !slidePage && current === value ? undefined : value); }}>
                  <BoardToolIcon tool={value} />{value === "text" ? "Text" : value === "equation" ? "Equation" : "Sticky"}
                </button>)}
                {([["shapes", "Shapes"], ["templates", "Templates"]] as const).map(([value, label]) => (
                  <button key={value} type="button" className="notebook-tool" data-tool={value} aria-expanded={insertPanel === value}
                    onClick={() => { if (slidePage) mutate((room) => ({ ...room, showSlides: false })); setConnectorMode(false); setTool("select"); setPlacement(undefined); setInsertPanel((open) => !slidePage && open === value ? undefined : value); }}>
                    <BoardToolIcon tool={value} />{label}
                  </button>
                ))}
                <button type="button" className="notebook-tool" aria-pressed={connectorMode}
                  onClick={() => { if (slidePage) mutate((room) => ({ ...room, showSlides: false })); setTool("select"); setPlacement(undefined); setInsertPanel(undefined); setConnectorMode((value) => slidePage ? true : !value); }}>
                  <BoardToolIcon tool="arrow" />Connector
                </button>
              <button type="button" className="notebook-tool" disabled={slideBusy || !uploadEnabled}
                aria-label="Upload slides or notes" title="Upload slides or notes. PDF preserves layout. Maximum 20 MB and 50 pages."
                aria-describedby="lecture-upload-help" onClick={() => uploadInput.current?.click()}>
                <BoardToolIcon tool="upload" />Upload
              </button>
            </div>
            <div className="notebook-tool-group">
              {(["undo", "redo"] as const).map((action) => <button key={action} type="button" className="notebook-tool capitalize"
                disabled={slidePage ? !currentSlideHistory?.[action].length : !inkHistory.current[action].length} onClick={() => restoreInk(action)}>
                <BoardToolIcon tool={action} />{action}
              </button>)}
            </div>
          </nav>
        )}
        {slidePage && deck && isTeacher && <aside className={`notebook-pages shrink-0 p-3 lg:overflow-y-auto ${showPages ? "lg:w-44" : "lg:w-20"}`}>
          {slidePage && deck && isTeacher && (
            <section className="mb-3">
              <button type="button" className="notebook-section" aria-expanded={showPages} onClick={() => setShowPages((open) => !open)}>
                Pages <span aria-hidden="true">{showPages ? "«" : "»"}</span>
              </button>
              {showPages && <TeacherSlidePreviews key={deck.id} deck={deck}
                imported={localSlides.current?.id === deck.id ? localSlides.current.pages : undefined}
                privatePages={state.privateSlidePages} storageOwner={teacherStorageEnabled ? userId : undefined}
                disabled={slideBusy || state.ended} onPresent={(page) => void changeSlide(page)} />}
            </section>
          )}
        </aside>}

        <main className={`${slidePage ? "bg-slate-100" : "notebook-stage"} flex min-w-0 flex-1 flex-col gap-3 p-3 md:p-5 lg:overflow-y-auto lg:overscroll-contain`}>
          {topics.length > 0 && <details className="notebook-topics min-w-0 rounded-xl border border-stone bg-eggshell px-3">
          <summary className="notebook-section">Topics <span className="text-sm font-normal text-smoke">{topics.length}</span></summary>
          <div className="pb-2">
          <ConceptColumn topics={topics} currentId={live} canEdit={isTeacher} hrefFor={(id) => `/room/${code}/topic/${id}${roleQ}`}
            onEdit={(id, p) => mutate((s) => ({ ...s, topics: s.topics.map((t) => (t.id === id ? { ...t, ...p, auto: false } : t)) }))} />
          </div>
          </details>}
          {!isTeacher && authReady && state.question && <CheckIn key={checkInKey} storageKey={checkInKey} text={state.question.text} open={state.question.open} answer={state.question.answer} correct={state.question.correct} total={state.question.total} grade={grades[state.question.id]} onSubmit={(v) => submitAnswer(state.question!.id, v)} />}
          {!isTeacher && spotBlock && spot && spot.ts !== spotSeen && (
            <div role="status" className="pop-in flex flex-wrap items-center gap-3 rounded-[20px] border border-sky bg-sky-soft p-3 text-sm">
              <span className="min-w-0 flex-1">Your teacher is going back over: <b>{spotBlock.content}</b></span>
              <button className="btn btn-outline btn-sm" onClick={() => setSpotSeen(spot.ts)}>Got it</button>
            </div>
          )}
          {((isTeacher && !state.ended) || privateEditing) && (tool === "pen" || tool === "highlight") && (
            <div role="group" aria-label="Ink settings" className="notebook-tray flex flex-wrap items-center gap-x-4 gap-y-2 self-center p-2 [@media(pointer:coarse)]:[&_button]:min-h-11 [@media(pointer:coarse)]:[&_button]:min-w-11 [@media(pointer:coarse)]:[&_select]:min-h-11">
                <div role="group" aria-label="Ink color" className="flex gap-1">
                  {(tool === "pen" ? INK_COLORS : HIGHLIGHT_COLORS).map(([name, color]) => (
                    <button type="button" key={name} aria-label={name} title={name} aria-pressed={(tool === "pen" ? penColor : highlightColor) === color}
                      onClick={() => tool === "pen" ? setPenColor(color) : setHighlightColor(color)}
                      className="notebook-swatch grid size-9 place-items-center rounded-full border border-transparent">
                      <span aria-hidden="true" className="size-5 rounded-full border border-black/15" style={{ backgroundColor: color }} />
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  Width
                  <ChoiceMenu label="Ink width" value={tool === "pen" ? penWidth : highlightWidth}
                    onChange={(value) => tool === "pen" ? setPenWidth(Number(value)) : setHighlightWidth(Number(value))}>
                    {(tool === "pen" ? [2, 3, 6] : [8, 14, 22]).map((width, i) => (
                      <option key={width} value={width}>{["Fine", "Medium", "Wide"][i]}</option>
                    ))}
                  </ChoiceMenu>
                </div>
            </div>
          )}
          {browseTopic && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 text-sm">
                Topic
                <ChoiceMenu label="Topic" value={browsedTopicId ?? ""}
                  onChange={(value) => { setBrowsedTopicId(value); setStudentView({ zoom: 1 }); setAnchor(null); setSnip(false); }}>
                  {state.topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.title}</option>)}
                </ChoiceMenu>
              </div>
              <button type="button" className="btn btn-sm btn-outline" aria-label="Zoom out" disabled={studentView.zoom <= 0.5}
                onClick={() => setStudentView((view) => ({ ...view, zoom: Math.max(0.5, view.zoom - 0.25) }))}>−</button>
              <button type="button" className="btn btn-sm btn-outline" aria-label="Reset browse view"
                onClick={() => setStudentView({ zoom: 1 })}>{Math.round(studentView.zoom * 100)}%</button>
              <button type="button" className="btn btn-sm btn-outline" aria-label="Zoom in" disabled={studentView.zoom >= 2.5}
                onClick={() => setStudentView((view) => ({ ...view, zoom: Math.min(2.5, view.zoom + 0.25) }))}>+</button>
            </div>
          )}
          {isTeacher && !state.ended && (
            <div className="flex flex-wrap items-center gap-2">
                <input ref={uploadInput} hidden type="file" accept={lectureFormats} disabled={slideBusy || !uploadEnabled}
                  onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void changeSlide(1, "presented", file); }} />
              <p id="lecture-upload-help" className={uploadEnabled ? "sr-only" : "text-sm"}>
                {uploadEnabled ? "PDF preserves layout. Images and plain text also work. Maximum 20 MB and 50 pages."
                  : teacherStorageEnabled && signInEnabled ? "Sign in as the teacher to upload slides or notes." : "Slide uploads need teacher storage and sign-in configured."}
              </p>
              {!uploadEnabled && teacherStorageEnabled && authReady && signInEnabled && !user &&
                <button type="button" className="btn btn-sm btn-outline" onClick={() => void signIn()}>Sign in to upload</button>}
              {slideBusy && <p role="status" className="text-sm">Preparing pages…</p>}
              {deck && <button className="btn btn-sm btn-outline" disabled={slideBusy} onClick={() => { setAnchor(null); mutate((s) => ({ ...s, showSlides: !s.showSlides })); }}>
                {state.showSlides ? "Show whiteboard" : "Show slides"}
              </button>}
              {slideError && <p role="alert" className="text-sm">{slideError}</p>}
              {teacherStorageError && <p role="status" className="text-sm">{teacherStorageError}</p>}
            </div>
          )}
          <div className="relative z-30">
          <AnimatedPanel open={((isTeacher && !state.ended && !slidePage) || privateEditing) && !!insertPanel} reduced={prefs.reduceMotion}>
            {insertPanel && <BoardObjects panel={insertPanel} onClose={() => setInsertPanel(undefined)}
              onChooseShape={(shape) => {
                if (shape === "arrow") setConnectorMode(true);
                else setPlacement(shape);
                setInsertPanel(undefined);
              }}
              onAdd={(items) => {
              if (privateEditing) {
                addPrivateBlocks(items.map((item, index) => ({
                  ...item,
                  position: [(slidePage ? 0 : studentView.position?.[0] ?? 0) / studentView.zoom + .08 + index * .24,
                    (slidePage ? 0 : studentView.position?.[1] ?? 0) / studentView.zoom + .12],
                })));
                setInsertPanel(undefined);
                return;
              }
              const ts = Date.now();
              const current = getState();
              if (!current || current.ended) return;
              const topicId = current.currentTopicId ?? uid();
              mutate((room) => ({
                ...room,
                currentTopicId: topicId,
                topics: room.currentTopicId ? room.topics : [...room.topics, { id: topicId, title: "New topic", summary: "", ts, auto: true }],
                blocks: [...room.blocks, ...items.map((item, index) => ({
                  ...item, id: uid(), topicId, order: room.blocks.length + index, ts,
                }))],
              }));
              setInsertPanel(undefined);
            }} />}
          </AnimatedPanel>
          </div>
          {deck && slidePage && (
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Slide controls">
              {(!isTeacher || !state.ended) && <div aria-label="Slide navigation" role="group" className="flex items-center gap-2">
                <button type="button" className="btn btn-sm btn-outline" aria-label="Previous slide"
                  disabled={slideBusy || !previousSlide}
                  onClick={() => isTeacher ? void changeSlide(previousSlide) : setStudentSelection({ deckId: deck.id, page: previousSlide })}>‹</button>
                <span className="notebook-pagination text-sm" aria-live="polite">Slide {slideNumber} of {deck.total}</span>
                <button type="button" className="btn btn-sm btn-outline" aria-label="Next slide"
                  disabled={slideBusy || !nextSlide || nextSlide > deck.total}
                  onClick={() => isTeacher ? void changeSlide(nextSlide) : setStudentSelection({ deckId: deck.id, page: nextSlide })}>›</button>
              </div>}
              {isTeacher && !state.ended ? <>
                <div className="flex items-center gap-2 text-sm">Student slide access
                  <ChoiceMenu label="Student slide access" value={deck.access} disabled={slideBusy}
                    onChange={(value) => void changeSlide(deck.current, value === "all" ? "all" : "presented")}>
                    <option value="presented">Presented slides only</option><option value="all">Entire deck</option>
                  </ChoiceMenu>
                </div>
              </> : !isTeacher && <>
                <div className="flex items-center gap-2 text-sm">Slide
                  <ChoiceMenu label="Slide" value={studentSlide && deck.pages[studentSlide] ? studentSlide : ""}
                    onChange={(value) => {
                      const page = Number(value);
                      setStudentSelection(page ? { deckId: deck.id, page } : undefined);
                      setAnchor(null); setSnip(false);
                    }}>
                    <option value="">Follow teacher · Slide {deck.current}</option>
                    {Object.keys(deck.pages).map((number) => <option key={number} value={number}>Slide {number}</option>)}
                  </ChoiceMenu>
                </div>
                <button className="btn btn-sm btn-outline" onClick={() => askAboutSlide()}>Ask about this slide</button>
              </>}
            </div>
          )}
          {!isTeacher && !wantTeacher && authReady && <StudentNotes key={studentNotesKey} storageKey={studentNotesKey} />}
          {collaborationId && user && collaboration.ready && <SharedNotepads key={`${collaborationId}:${user.id}`}
            board={collaborationId} userId={user.id} teacher={isTeacher} allowed={collaboration.allowed && state.studentStickyPermission !== "closed"}
            notes={collaboration.notes} ended={state.ended}
            onAccessChange={(allowed) => mutate((room) => ({ ...room, studentStickyPermission: allowed ? "open" : "closed" }))} />}
          {collaborationId && user && collaboration.error && <p role="status" className="text-sm">{collaboration.error}</p>}
          {!isTeacher && (!privateNotes.ready || privateEditing || privateNotes.status === "Retry") && <div className="flex flex-wrap items-center gap-2">
            {authReady && !user && signInEnabled && <button type="button" className="btn btn-outline btn-sm" onClick={() => void signIn()}>Sign in to save private annotations</button>}
            {user && !privateNotes.ready && privateNotes.status !== "Retry" && <span role="status" className="text-sm text-smoke">
              {collaborationId ? "Waiting for account storage…" : "A signed-in teacher must open the board to enable account storage."}
            </span>}
            {user && privateNotes.status === "Retry" && <button type="button" className="btn btn-outline btn-sm" onClick={privateNotes.retry}>Retry annotation sync</button>}
            {privateEditing && privateNotes.status !== "Retry" && <span role="status" className="text-sm text-smoke">
              {privateNotes.status === "Saved" ? "Private annotations saved" : "Saving private annotations…"}
            </span>}
          </div>}
          <Whiteboard key={slidePage?.id ?? (browseTopic ? browsedTopicId : "live")} boardRef={boardRef} spotlightId={browseTopic ? undefined : spotBlock?.id}
            blocks={[...(slidePage ? [] : [...blocks, ...sharedNotepads]), ...(!isTeacher && annotationVisible ? privateNotes.data.blocks.filter((block) => block.surface === slidePage?.id) : [])]}
            strokes={[...(slidePage ? slideInk : visibleInk), ...(!isTeacher && annotationVisible ? privateNotes.data.strokes.filter((stroke) => stroke.surface === slidePage?.id) : [])]} isTeacher={isTeacher} selectedIds={anchor?.ids ?? []}
            privateInk={privateEditing}
            canEraseStroke={privateEditing ? (id) => privateNotes.data.strokes.some((stroke) => stroke.id === id) : undefined}
            canEditBlock={(id) => isTeacher ? !sharedNotepads.some((note) => note.id === id) : privateEditing && isPrivate(id)}
            connectorMode={(isTeacher || privateEditing) && connectorMode}
            onConnector={privateEditing ? (connector, id) => {
              if (id) editPrivateBlock(id, { connector });
              else addPrivateBlocks([{ kind: "connector", content: "Connector", connector }]);
            } : isTeacher && !state.ended && !slidePage ? (connector, id) => {
              if (id) { editBoardBlock(id, { connector }); return; }
              const current = getState();
              if (!current || current.ended) return;
              const topicId = current.currentTopicId ?? uid();
              rememberBlocks(current);
              mutate((room) => ({ ...room, currentTopicId: topicId,
                topics: room.currentTopicId ? room.topics : [...room.topics, { id: topicId, title: "New topic", summary: "", ts: Date.now(), auto: true }],
                blocks: [...room.blocks, { id: uid(), kind: "connector", topicId, content: "Connector", connector, order: room.blocks.length, ts: Date.now() }] }));
            } : undefined}
            modeIcon={privateEditing ? placement ?? insertPanel ?? (tool !== "select" ? tool : undefined)
              : isTeacher && !state.ended ? (slidePage ? (tool === "select" ? "upload" : tool) : placement ?? insertPanel ?? (tool !== "select" ? tool : undefined)) : undefined}
            placement={(!slidePage && isTeacher && !state.ended) || privateEditing ? placement : undefined}
            onPlace={(kind, content, position, runs, shapeSize) => {
              const id = isTeacher ? addBlock(kind, content, position, runs, shapeSize) : undefined;
              if (privateEditing) {
                const target = kind === "text" ? state.blocks.find((block) => block.id === attachTo?.id) : undefined;
                const privateId = addPrivateBlocks([{ kind, content, textRuns: runs, position, shapeSize,
                  attachedTo: target?.id, attachmentOrigin: target ? target.position ?? attachTo?.position : undefined,
                }]);
                setAttachTo(undefined);
                setPlacement(undefined);
                return privateId;
              }
              setPlacement(undefined);
              return id;
            }}
            onCancelPlacement={() => { setPlacement(undefined); setConnectorMode(false); }}
            onMoveBlock={(isTeacher && !state.ended) || privateEditing ? (id, position) => {
              setAnchor(null);
              if (privateEditing) editPrivateBlock(id, { position });
              else editBoardBlock(id, { position });
            } : undefined}
            slide={slidePage ? { url: slideUrl(slidePage), aspect: slidePage.width / slidePage.height } : undefined}
            zoom={slidePage ? 1 : browseTopic || privateEditing ? studentView.zoom : boardZoom}
            position={slidePage ? undefined : browseTopic || privateEditing ? studentView.position : state.boardPosition}
            onZoom={slidePage ? undefined : browseTopic || privateEditing ? (zoom, position) => setStudentView({ zoom, position }) : isTeacher && !state.ended ? setBoardZoom : undefined}
            onSelect={(a) => {
              if (privateEditing) {
                if (!isPrivate(a.ids[0]) && state.blocks.some((block) => block.id === a.ids[0])) {
                  setAttachTo({ id: a.ids[0], position: a.boardPosition }); setTool("select"); setPlacement("text");
                }
              } else if (!isTeacher) openAnchor(a);
            }} snipActive={snip && !isTeacher && !privateEditing} tool={privateEditing || !state.ended ? tool : "select"}
            ink={tool === "highlight" ? { color: highlightColor, width: highlightWidth, opacity: 0.35 } : { color: penColor, width: penWidth }}
            onSnip={(a) => { if (!a) { setSnip(false); return; } if (slidePage) askAboutSlide(a); else openAnchor(a); }}
            onStroke={(stroke) => privateEditing
              ? privateNotes.update((data) => ({ ...data, strokes: [...data.strokes, { ...stroke, id: uid(), surface: slidePage?.id }] }))
              : slidePage ? editSlideInk((ink) => [...ink, { ...stroke, id: uid() }]) : addStroke(stroke)}
            onErase={(ids) => privateEditing
              ? privateNotes.update((data) => ({ ...data, strokes: data.strokes.filter((stroke) => !ids.has(stroke.id)) }))
              : slidePage ? editSlideInk((ink) => ink.filter((stroke) => !ids.has(stroke.id))) : eraseInk(ids)}
            onEditSticky={privateEditing ? editPrivateBlock : isTeacher && !state.ended ? editBoardBlock : undefined}
            onResizeBlock={privateEditing ? editPrivateBlock : isTeacher && !state.ended ? editBoardBlock : undefined}
            onEditText={(isTeacher && !state.ended) || privateEditing ? (id, content, textRuns) => {
              if (privateEditing) {
                editPrivateBlock(id, { content, textRuns });
                return;
              }
              const block = getState()?.blocks.find((item) => item.id === id);
              if (block && (block.content !== content || JSON.stringify(block.textRuns) !== JSON.stringify(textRuns))) {
                editBoardBlock(id, { content, textRuns });
              }
            } : undefined}
            onDuplicateSticky={privateEditing ? (block) => addPrivateBlocks([{ ...block,
              position: block.position && [block.position[0] + .025, block.position[1] + .035],
            }]) : isTeacher && !state.ended ? (block) => mutate((room) => ({
              ...room, blocks: [...room.blocks, { ...block, id: uid(), ts: Date.now(), order: room.blocks.length,
                position: block.position && [block.position[0] + .025, block.position[1] + .035] }],
            })) : undefined}
            onDelete={(id, detached, origin) => {
              if (privateEditing) {
                privateNotes.update((data) => ({ ...data, blocks: data.blocks.filter((block) => block.id !== id)
                  .map((block) => detached?.[block.id] ? { ...block, connector: detached[block.id] } : block) }));
                return;
              }
              const current = getState();
              if (!current || !isTeacher || current.ended) return;
              rememberBlocks(current);
              mutate((room) => ({ ...room, removedBlockPositions: origin ? { ...room.removedBlockPositions, [id]: origin } : room.removedBlockPositions, blocks: room.blocks.filter((block) => block.id !== id)
                .map((block) => detached?.[block.id] ? { ...block, connector: detached[block.id] } : block) }));
            }}>
            {anchor && !isTeacher && board && (
              <AskPanel rect={anchor.rect} boardW={board.width} boardH={board.height} empty={anchor.ids.length === 0 && !anchor.image}
                excerpt={[...(anchor.image ? ["✎ handwriting"] : []), ...sel.map((b) => b.content)].join("  ·  ")} basedOn={`${state.topics.find((t) => t.id === sel[0]?.topicId)?.title ?? "lecture"} · ${sel.length} note${sel.length === 1 ? "" : "s"}, plus nearby lecture context`}
                msgs={msgs} loading={loading} error={error} suggestion={suggestion} fed={fed}
                onSend={(k, q, g) => void ask(anchor, k as AIKind, q, g)} onQuiz={(ok) => rec(ok ? "quizRight" : "quizWrong")} onClose={() => { setAnchor(null); setMsgs([]); }} onFeedback={feedback} />
            )}
          </Whiteboard>
          {((isTeacher && !state.ended) || privateEditing) && !slidePage && (
              <div role="group" aria-label="Board zoom" className="flex items-center justify-end gap-1">
                <button type="button" className="btn btn-sm btn-outline" aria-label="Zoom out" disabled={annotationZoom <= 0.5}
                  onClick={() => adjustAnnotationZoom(Math.max(.5, annotationZoom - .25))}>−</button>
                <button type="button" className="btn btn-sm btn-outline min-w-16" aria-label={`Reset board zoom, currently ${Math.round(annotationZoom * 100)}%`}
                  onClick={() => adjustAnnotationZoom(1)}>{Math.round(annotationZoom * 100)}%</button>
                <button type="button" className="btn btn-sm btn-outline" aria-label="Zoom in" disabled={annotationZoom >= 2.5}
                  onClick={() => adjustAnnotationZoom(Math.min(2.5, annotationZoom + .25))}>+</button>
              </div>
          )}

          {isTeacher && !state.ended && !slidePage && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-stone bg-eggshell px-2 py-1.5">
              <button type="button" className="btn btn-sm btn-outline" aria-expanded={chooseBoard} onClick={() => {
                if (state.blocks.length || state.strokes.length) setChooseBoard((open) => !open);
                else startTopic(false);
              }}>Start new topic</button>
              {state.strokes.length > 0 && <button type="button" className="btn btn-sm btn-outline" onClick={() => clearBoard("pen")}>Clear pen</button>}
              {(state.blocks.length > 0 || state.strokes.length > 0) && <button type="button" className="btn btn-sm btn-outline" onClick={() => clearBoard("all")}>Clear board</button>}
              {chooseBoard && <div role="group" aria-label="Board options for the new topic" className="flex w-full flex-wrap items-center gap-2 border-t border-stone pt-3">
                <p className="mr-auto text-sm">Keep the current board for the new topic?</p>
                <button type="button" className="btn btn-sm btn-outline" onClick={() => startTopic(false)}>Keep board</button>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => startTopic(true)}>Archive and clear</button>
                <button type="button" className="btn btn-sm btn-outline" onClick={() => setChooseBoard(false)}>Cancel</button>
              </div>}
            </div>
          )}
          {isTeacher && !state.ended && (
            state.question?.open ? (
              <div className="flex flex-wrap items-center gap-3 rounded-[20px] border-2 border-sky bg-sky-soft p-3 text-sm">
                <span className="min-w-0 flex-1">Question open: <b>{state.question.text}</b> · {new Set(events.filter((e) => e.kind === "answer" && e.questionId === state.question!.id).map((e) => e.sid)).size} answered</span>
                <button className="btn btn-dark btn-sm" onClick={closeQuestion}>Close question</button>
              </div>
            ) : (
              <form className="flex flex-wrap items-center gap-2 rounded-[20px] border border-stone bg-eggshell p-3" onSubmit={(e) => { e.preventDefault(); postQuestion(); }}>
                <label className="sr-only" htmlFor="q-text">Question for students</label>
                <input id="q-text" className="input !min-h-10 min-w-[180px] flex-[2]" placeholder="Ask the class a question, e.g. What is x?" value={qText} onChange={(e) => setQText(e.target.value)} />
                <label className="sr-only" htmlFor="q-ans">Correct answer (only you see this)</label>
                <input id="q-ans" className="input !min-h-10 min-w-[120px] flex-1" placeholder="Answer key (hidden)" value={qAnswer} onChange={(e) => setQAnswer(e.target.value)} />
                <button className="btn btn-primary btn-sm" disabled={!qText.trim() || !qAnswer.trim()}>Ask class</button>
              </form>
            )
          )}
        </main>

        <AnimatedPanel open={isTeacher && showInsights} motion="side" reduced={prefs.reduceMotion}>
          <Insights state={state} events={events} connected={connected} demo={demoMode} />
        </AnimatedPanel>
      </div>

      {isTeacher && alerts.length > 0 && (
        <div role="alert" className="pop-in fixed right-4 top-20 z-40 w-[min(340px,calc(100vw-2rem))] rounded-[20px] border-2 border-sky bg-eggshell p-4 shadow-[0_8px_30px_rgba(0,0,0,.18)]">
          <p className="text-xs font-medium text-sky-deep">Students need help</p>
          <p className="mt-1 text-sm"><b>{alerts[0].unresolved}</b> student{alerts[0].unresolved === 1 ? " is" : "s are"} still confused about <b>{alerts[0].label}</b>.</p>
          <p className="mt-1 text-xs text-smoke">Anonymous. Consider re-explaining before moving on.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {state.blocks.some((b) => b.id === alerts[0].key) && <button className="btn btn-primary btn-sm" onClick={() => { revisit(alerts[0].key); setDismissed((d) => [...d, `${alerts[0].key}:${alerts[0].unresolved}`]); }}>Revisit this</button>}
            <button className="btn btn-outline btn-sm" onClick={() => setDismissed((d) => [...d, `${alerts[0].key}:${alerts[0].unresolved}`])}>Dismiss</button>
          </div>
        </div>
      )}
      {popup && !isTeacher && <Popup p={popup} onDismiss={() => setPopup(null)} onNever={() => { update({ popups: false }); setPopup(null); }} />}
      <AnimatedPanel open={showProfile && !isTeacher} motion="drawer" reduced={prefs.reduceMotion}>
        <ProfileSheet profile={profile} study={study} syncError={syncError} onClose={() => setShowProfile(false)} onReset={() => { saveProfile({}, userId); saveStudy([], userId); setProfile({}); setStudy([]); }} />
      </AnimatedPanel>
      <AnimatedPanel open={showArchive} motion="drawer" reduced={prefs.reduceMotion}>
        <ArchiveSheet boards={state.archive ?? []} onClose={() => setShowArchive(false)} />
      </AnimatedPanel>
      {isTeacher && showRecap && <PostClassSheet state={state} onClose={() => setShowRecap(false)} />}
      <AnimatedPanel open={showSettings} motion="drawer" reduced={prefs.reduceMotion}>
        <SettingsSheet prefs={prefs} update={update} reset={reset} onClose={() => setShowSettings(false)} />
      </AnimatedPanel>
      {catchup && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={() => setCatchup(null)}>
          <aside role="dialog" aria-label="Catch me up" className="h-full w-[min(380px,100vw)] overflow-y-auto bg-eggshell p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="display text-3xl">Catch me up</h2>
            <p className="mt-1 text-xs text-smoke">{catchup.source === "demo" ? "Demo response (no AI key set)" : "AI summary of what changed"}</p>
            <p className="mt-4 whitespace-pre-wrap" aria-live="polite">{catchupLoading ? "Thinking…" : <RichText text={catchup.text} />}</p>
            <div className="mt-6 flex flex-wrap gap-2">
              <button className="btn btn-outline" disabled={catchupLoading} onClick={() => void openCatchup("long")}>Explain more</button>
              <button className="btn btn-primary" onClick={() => { setCatchup(null); setLastViewed(live); setAnchor(null); boardRef.current?.querySelector("[role=region]")?.scrollTo({ top: 1e6 }); }}>Return to live</button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
