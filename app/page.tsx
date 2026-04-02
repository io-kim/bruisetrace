"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const DESKTOP_OUTER_WIDTH = 940;
const DESKTOP_INNER_WIDTH = 904;
const HEADER_HEIGHT = 50;
const SECTION_TOP_GAP = 10;
const INFO_BOTTOM_GAP = 20;
const ANALYSIS_SWITCH_GAP = 0;

const INFO_COL1 = 188;
const INFO_GAP12 = 15;
const INFO_COL2 = 500;
const INFO_GAP23 = 11;
const INFO_COL3 = 190;

const ANALYSIS_COL1 = 188;
const ANALYSIS_GAP12 = 15;
const ANALYSIS_COL2 = 345;
const ANALYSIS_GAP23 = 11;
const ANALYSIS_COL3 = 345;

const PHOTO_SIZE = 500;
const PASS_CARD_HEIGHT = 145;
const ANALYZE_HEIGHT = 35;
const CANVAS_SIZE = 500;

type NavKey = "home" | "information" | "analysis";
type ToolKey = "upload" | "brush" | "erase" | null;
type PassKey = 1 | 2 | 3;
type StageKey = "red" | "blue" | "purple" | "brown" | "yellow";
type IntensityLabel = "Mild" | "Moderate" | "Strong" | "Very Strong";
type ConsistencyLabel = "Low" | "Moderate" | "High";

type AnalysisData = {
  stageScores: Record<StageKey, number>;
  visualStage: StageKey;
  expectedStage: StageKey;
  healingText: string;
  intensityScore: number;
  intensityLabel: IntensityLabel;
  consistencyScore: number;
  consistencyLabel: ConsistencyLabel;
  visualSummary: string;
  intensitySummary: string;
  consistencySummary: string;
};

function UserIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8.2" r="3.6" stroke="currentColor" strokeWidth="1.8" />
      <path d="M6.6 18.3C8 15.7 10.1 14.5 12 14.5C13.9 14.5 16 15.7 17.4 18.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 15V5.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8.7 8.8L12 5.5L15.3 8.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 18.5H18.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4.2 8.2C4.2 7.32 4.92 6.6 5.8 6.6H7.25C7.66 6.6 8.05 6.44 8.34 6.15L9.18 5.31C9.48 5.01 9.87 4.85 10.28 4.85H13.72C14.13 4.85 14.52 5.01 14.82 5.31L15.66 6.15C15.95 6.44 16.34 6.6 16.75 6.6H18.2C19.08 6.6 19.8 7.32 19.8 8.2V17C19.8 17.88 19.08 18.6 18.2 18.6H5.8C4.92 18.6 4.2 17.88 4.2 17V8.2Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="12.2" r="3.1" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function createEmptyMask() {
  return new Uint8Array(CANVAS_SIZE * CANVAS_SIZE);
}

function drawCircle(mask: Uint8Array, cx: number, cy: number, radius: number, fillValue: 0 | 1) {
  const x0 = clamp(Math.floor(cx - radius), 0, CANVAS_SIZE - 1);
  const x1 = clamp(Math.ceil(cx + radius), 0, CANVAS_SIZE - 1);
  const y0 = clamp(Math.floor(cy - radius), 0, CANVAS_SIZE - 1);
  const y1 = clamp(Math.ceil(cy + radius), 0, CANVAS_SIZE - 1);
  const r2 = radius * radius;
  for (let y = y0; y <= y1; y++) {
    const dy = y - cy;
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      if (dx * dx + dy * dy <= r2) mask[y * CANVAS_SIZE + x] = fillValue;
    }
  }
}

function countMask(mask: Uint8Array) {
  let total = 0;
  for (let i = 0; i < mask.length; i++) total += mask[i];
  return total;
}

function normalizeStageScores(raw: Record<StageKey, number>) {
  const total = Object.values(raw).reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return {
      red: 0,
      blue: 0,
      purple: 0,
      brown: 0,
      yellow: 0,
    };
  }
  return {
    red: raw.red / total,
    blue: raw.blue / total,
    purple: raw.purple / total,
    brown: raw.brown / total,
    yellow: raw.yellow / total,
  };
}

function formatScore(value: number) {
  return `${value.toFixed(2)} / 1.00`;
}

function getTopStage(scores: Record<StageKey, number>): StageKey {
  return (Object.entries(scores) as Array<[StageKey, number]>).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "red";
}

function stageLabel(stage: StageKey) {
  switch (stage) {
    case "red":
      return "Red";
    case "blue":
      return "Blue";
    case "purple":
      return "Purple";
    case "brown":
      return "Brown";
    case "yellow":
      return "Yellow";
  }
}

function getExpectedStage(age: string | null): StageKey {
  switch (age) {
    case "Within 24h":
      return "red";
    case "1-2 days":
      return "red";
    case "3-4 days":
      return "blue";
    case "5-7 days":
      return "purple";
    case "8-10 days":
      return "brown";
    case "11-13 days":
      return "yellow";
    case "14+ days":
      return "yellow";
    case "Unknown":
    default:
      return "purple";
  }
}

function getIntensityLabel(score: number): IntensityLabel {
  if (score >= 0.8) return "Very Strong";
  if (score >= 0.58) return "Strong";
  if (score >= 0.34) return "Moderate";
  return "Mild";
}

function getConsistencyLabel(score: number): ConsistencyLabel {
  if (score >= 0.72) return "High";
  if (score >= 0.4) return "Moderate";
  return "Low";
}

function getHealingMessage(expectedStage: StageKey, visualStage: StageKey) {
  const stageOrder: StageKey[] = ["red", "blue", "purple", "brown", "yellow"];
  const expectedIndex = stageOrder.indexOf(expectedStage);
  const visualIndex = stageOrder.indexOf(visualStage);
  const delta = visualIndex - expectedIndex;

  if (Math.abs(delta) <= 0) {
    return `Healing appears broadly in line with the reported timing. The current visual stage is close to the expected ${stageLabel(expectedStage)} stage.`;
  }
  if (delta === 1) {
    return `Healing appears slightly later in the color sequence than expected. The current visual stage looks somewhat more advanced than the expected ${stageLabel(expectedStage)} stage.`;
  }
  if (delta >= 2) {
    return `Healing appears noticeably later in the color sequence than expected. The current visual stage looks more advanced than the expected ${stageLabel(expectedStage)} stage for the reported timing.`;
  }
  if (delta === -1) {
    return `Healing appears slightly slower than expected. The current visual stage looks somewhat earlier than the expected ${stageLabel(expectedStage)} stage.`;
  }
  return `Healing appears slower than expected. The current visual stage looks earlier than the expected ${stageLabel(expectedStage)} stage for the reported timing.`;
}

function getPointerLeft(stage: StageKey) {
  const order: StageKey[] = ["red", "blue", "purple", "brown", "yellow"];
  const index = order.indexOf(stage);
  return `${10 + index * 20}%`;
}

function createConsensusMask(savedMasks: Uint8Array[]) {
  const consensus = new Uint8Array(CANVAS_SIZE * CANVAS_SIZE);
  if (savedMasks.length === 0) return consensus;
  if (savedMasks.length === 1) return new Uint8Array(savedMasks[0]);

  for (let i = 0; i < consensus.length; i++) {
    let hits = 0;
    for (const mask of savedMasks) hits += mask[i] ? 1 : 0;
    if (hits >= Math.ceil(savedMasks.length / 2)) consensus[i] = 1;
  }

  if (countMask(consensus) === 0) {
    return new Uint8Array(savedMasks[0]);
  }
  return consensus;
}

function computeJaccard(a: Uint8Array, b: Uint8Array) {
  let intersection = 0;
  let union = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i] === 1;
    const bv = b[i] === 1;
    if (av || bv) union++;
    if (av && bv) intersection++;
  }
  if (union === 0) return 1;
  return intersection / union;
}

async function loadImageElement(src: string) {
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function computeAnalysis(params: {
  imageSrc: string;
  displayScale: number;
  imageOffset: { x: number; y: number };
  savedPassMasks: Uint8Array[];
  selectedAge: string | null;
}) {
  const { imageSrc, displayScale, imageOffset, savedPassMasks, selectedAge } = params;
  const img = await loadImageElement(imageSrc);
  const workCanvas = document.createElement("canvas");
  workCanvas.width = CANVAS_SIZE;
  workCanvas.height = CANVAS_SIZE;
  const ctx = workCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas context unavailable");

  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  const containScale = Math.min(CANVAS_SIZE / img.width, CANVAS_SIZE / img.height);
  const baseWidth = img.width * containScale;
  const baseHeight = img.height * containScale;
  const drawWidth = baseWidth * displayScale;
  const drawHeight = baseHeight * displayScale;
  const drawX = (CANVAS_SIZE - drawWidth) / 2 + imageOffset.x;
  const drawY = (CANVAS_SIZE - drawHeight) / 2 + imageOffset.y;

  ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

  const consensusMask = createConsensusMask(savedPassMasks);
  const imageData = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE).data;

  let selectedCount = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sumBrightness = 0;
  let sumSaturation = 0;
  let sumDiffRG = 0;
  let sumDiffRB = 0;
  let sumDiffGB = 0;

  const rawScores: Record<StageKey, number> = {
    red: 0,
    blue: 0,
    purple: 0,
    brown: 0,
    yellow: 0,
  };

  for (let i = 0; i < consensusMask.length; i++) {
    if (!consensusMask[i]) continue;
    const idx = i * 4;
    const r = imageData[idx];
    const g = imageData[idx + 1];
    const b = imageData[idx + 2];
    const a = imageData[idx + 3];
    if (a === 0) continue;

    selectedCount++;
    sumR += r;
    sumG += g;
    sumB += b;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const brightness = max / 255;
    const saturation = max === 0 ? 0 : (max - min) / max;

    sumBrightness += brightness;
    sumSaturation += saturation;
    sumDiffRG += Math.abs(r - g) / 255;
    sumDiffRB += Math.abs(r - b) / 255;
    sumDiffGB += Math.abs(g - b) / 255;

    const redness = Math.max(0, (r - Math.max(g, b)) / 255);
    const blueness = Math.max(0, (b - Math.max(r, g)) / 255);
    const purpleness = Math.max(0, (Math.min(r, b) - g) / 255);
    const yellowness = Math.max(0, ((r + g) / 2 - b) / 255);
    const brownness = Math.max(0, ((r + g) / 2 - b) / 255) * (1 - brightness + 0.2);

    rawScores.red += redness + (r / 255) * 0.15;
    rawScores.blue += blueness + (b / 255) * 0.15;
    rawScores.purple += purpleness + Math.min(r, b) / 255 * 0.2;
    rawScores.yellow += yellowness * brightness;
    rawScores.brown += brownness * saturation;
  }

  if (selectedCount === 0) {
    throw new Error("No selected pixels found");
  }

  const avgR = sumR / selectedCount;
  const avgG = sumG / selectedCount;
  const avgB = sumB / selectedCount;
  const avgBrightness = sumBrightness / selectedCount;
  const avgSaturation = sumSaturation / selectedCount;
  const avgColorSpread = (sumDiffRG + sumDiffRB + sumDiffGB) / (selectedCount * 3);

  rawScores.red += Math.max(0, (avgR - avgG) / 255) * 0.8;
  rawScores.blue += Math.max(0, (avgB - avgR) / 255) * 0.8;
  rawScores.purple += Math.max(0, (Math.min(avgR, avgB) - avgG) / 255) * 1.1;
  rawScores.brown += Math.max(0, ((avgR + avgG) / 2 - avgB) / 255) * (1 - avgBrightness + 0.25) * 1.3;
  rawScores.yellow += Math.max(0, ((avgR + avgG) / 2 - avgB) / 255) * avgBrightness * 1.2;

  const stageScores = normalizeStageScores(rawScores);
  const visualStage = getTopStage(stageScores);
  const expectedStage = getExpectedStage(selectedAge);

  const darkness = 1 - avgBrightness;
  const intensityScore = clamp(darkness * 0.7 + avgSaturation * 0.2 + avgColorSpread * 0.1, 0, 1);
  const intensityLabel = getIntensityLabel(intensityScore);

  let consistencyScore = 1;
  if (savedPassMasks.length === 2) {
    consistencyScore = computeJaccard(savedPassMasks[0], savedPassMasks[1]);
  } else if (savedPassMasks.length >= 3) {
    const s1 = computeJaccard(savedPassMasks[0], savedPassMasks[1]);
    const s2 = computeJaccard(savedPassMasks[0], savedPassMasks[2]);
    const s3 = computeJaccard(savedPassMasks[1], savedPassMasks[2]);
    consistencyScore = (s1 + s2 + s3) / 3;
  }
  consistencyScore = clamp(consistencyScore, 0, 1);
  const consistencyLabel = getConsistencyLabel(consistencyScore);

  const healingText = getHealingMessage(expectedStage, visualStage);
  const visualSummary = `The image most closely matches the ${stageLabel(visualStage)} stage.`;
  const intensitySummary = `The selected bruise core appears ${intensityLabel === "Very Strong" ? "very dark and visually concentrated" : intensityLabel === "Strong" ? "noticeably dark overall" : intensityLabel === "Moderate" ? "moderately visible in contrast" : "relatively light overall"}. The overall intensity is interpreted as ${intensityLabel}.`;
  const consistencySummary = `This reflects how similar your bruise boundary selections were across repeated passes. The current result is ${consistencyLabel.toLowerCase()}, based on overlap across saved passes.`;

  return {
    stageScores,
    visualStage,
    expectedStage,
    healingText,
    intensityScore,
    intensityLabel,
    consistencyScore,
    consistencyLabel,
    visualSummary,
    intensitySummary,
    consistencySummary,
  } satisfies AnalysisData;
}

export default function Page() {
  const [activeNav, setActiveNav] = useState<NavKey>("information");
  const [selectedAge, setSelectedAge] = useState<string | null>(null);
  const [selectedTool, setSelectedTool] = useState<ToolKey>(null);
  const [selectedPass, setSelectedPass] = useState<PassKey>(1);

  const [uploadSlider, setUploadSlider] = useState(0);
  const [brushSlider, setBrushSlider] = useState(50);
  const [eraseSlider, setEraseSlider] = useState(50);

  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [displayScale, setDisplayScale] = useState(1);
  const [imageOffset, setImageOffset] = useState({ x: 0, y: 0 });

  const [savedPasses, setSavedPasses] = useState<Record<PassKey, boolean>>({ 1: false, 2: false, 3: false });
  const [sameAsPrevious, setSameAsPrevious] = useState<Record<2 | 3, boolean>>({ 2: false, 3: false });
  const [maskCounts, setMaskCounts] = useState<Record<PassKey, number>>({ 1: 0, 2: 0, 3: 0 });

  const [cursor, setCursor] = useState({ x: 0, y: 0, visible: false });
  const [analysisViewed, setAnalysisViewed] = useState(false);
  const [showAgeAlert, setShowAgeAlert] = useState(false);
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const photoBoxRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const informationRef = useRef<HTMLDivElement | null>(null);
  const analysisRef = useRef<HTMLDivElement | null>(null);

  const drawingRef = useRef(false);
  const panningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, startX: 0, startY: 0 });
  const pendingAnalysisScrollRef = useRef(false);

  const masksRef = useRef<Record<PassKey, Uint8Array>>({
    1: createEmptyMask(),
    2: createEmptyMask(),
    3: createEmptyMask(),
  });

  const ageOptions = ["Unknown", "Within 24h", "1-2 days", "3-4 days", "5-7 days", "8-10 days", "11-13 days", "14+ days"];

  const activeSliderValue = selectedTool === "erase" ? eraseSlider : selectedTool === "brush" ? brushSlider : uploadSlider;
  const brushRadius = useMemo(() => 8 + (activeSliderValue / 100) * 28, [activeSliderValue]);
  const uploadControlActive = Boolean(imageSrc) && selectedTool !== "brush" && selectedTool !== "erase";
  const guidedDone = Boolean(imageSrc) && Boolean(maskCounts[1] > 0 || savedPasses[1] || selectedTool === "brush");
  const hasSavedPass = savedPasses[1] || savedPasses[2] || savedPasses[3];
  const analyzeReady = Boolean(selectedAge) && hasSavedPass && !isAnalyzing;

  const stageScores = analysisData?.stageScores ?? { red: 0, blue: 0, purple: 0, brown: 0, yellow: 0 };
  const visualStage = analysisData?.visualStage ?? "yellow";
  const expectedStage = analysisData?.expectedStage ?? getExpectedStage(selectedAge);

  useEffect(() => {
    setDisplayScale(1 + (uploadSlider / 100) * 0.8);
  }, [uploadSlider]);

  useEffect(() => {
    if (!analysisViewed || !analysisData || !analysisRef.current) {
      if (!analysisViewed) setActiveNav("information");
      return;
    }

    const updateActiveNav = () => {
      if (!analysisRef.current) return;
      const analysisTop = analysisRef.current.getBoundingClientRect().top;
      const threshold = HEADER_HEIGHT + SECTION_TOP_GAP + 1;
      setActiveNav(analysisTop <= threshold ? "analysis" : "information");
    };

    updateActiveNav();
    window.addEventListener("scroll", updateActiveNav, { passive: true });
    window.addEventListener("resize", updateActiveNav);

    return () => {
      window.removeEventListener("scroll", updateActiveNav);
      window.removeEventListener("resize", updateActiveNav);
    };
  }, [analysisViewed, analysisData]);

  useEffect(() => {
    if (!analysisViewed || !analysisData || !pendingAnalysisScrollRef.current || !analysisRef.current) return;

    const run = () => {
      if (!analysisRef.current) return;
      const y = window.scrollY + analysisRef.current.getBoundingClientRect().top - HEADER_HEIGHT - SECTION_TOP_GAP;
      window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
      setActiveNav("analysis");
      pendingAnalysisScrollRef.current = false;
    };

    const frame1 = requestAnimationFrame(() => {
      const frame2 = requestAnimationFrame(run);
      (run as typeof run & { __frame2?: number }).__frame2 = frame2;
    });

    return () => {
      cancelAnimationFrame(frame1);
      const frame2 = (run as typeof run & { __frame2?: number }).__frame2;
      if (typeof frame2 === "number") cancelAnimationFrame(frame2);
    };
  }, [analysisViewed, analysisData]);

  const passEnabled = (pass: PassKey) => (pass === 1 ? true : pass === 2 ? savedPasses[1] : savedPasses[2]);
  const nextAvailablePass: PassKey = savedPasses[1] ? (savedPasses[2] ? 3 : 2) : 1;

  const scrollToInformation = () => {
    pendingAnalysisScrollRef.current = false;
    setActiveNav("information");
    if (!informationRef.current) return;
    const y = window.scrollY + informationRef.current.getBoundingClientRect().top - HEADER_HEIGHT - SECTION_TOP_GAP;
    window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
  };

  const scrollToAnalysis = () => {
    pendingAnalysisScrollRef.current = false;
    setActiveNav("analysis");
    if (!analysisRef.current) return;
    const y = window.scrollY + analysisRef.current.getBoundingClientRect().top - HEADER_HEIGHT - SECTION_TOP_GAP;
    window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
  };

  const renderMask = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const mask = masksRef.current[selectedPass];
    const imageData = ctx.createImageData(CANVAS_SIZE, CANVAS_SIZE);
    const data = imageData.data;
    for (let i = 0; i < mask.length; i++) {
      if (mask[i]) {
        const idx = i * 4;
        data[idx] = 45;
        data[idx + 1] = 102;
        data[idx + 2] = 255;
        data[idx + 3] = 105;
      }
    }
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.putImageData(imageData, 0, 0);
  };

  useEffect(() => {
    renderMask();
  }, [selectedPass]);

  const getLocalPoint = (clientX: number, clientY: number) => {
    const box = photoBoxRef.current;
    if (!box) return null;
    const rect = box.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    return {
      px: clamp(px, 0, rect.width),
      py: clamp(py, 0, rect.height),
      x: clamp((px / rect.width) * CANVAS_SIZE, 0, CANVAS_SIZE - 1),
      y: clamp((py / rect.height) * CANVAS_SIZE, 0, CANVAS_SIZE - 1),
    };
  };

  const applyBrush = (clientX: number, clientY: number) => {
    if (selectedTool !== "brush" && selectedTool !== "erase") return;
    if (!passEnabled(selectedPass)) return;
    const point = getLocalPoint(clientX, clientY);
    if (!point) return;
    const mask = masksRef.current[selectedPass];
    drawCircle(mask, point.x, point.y, brushRadius, selectedTool === "brush" ? 1 : 0);
    setMaskCounts((prev) => ({ ...prev, [selectedPass]: countMask(mask) }));
    setCursor({ x: point.px, y: point.py, visible: true });
    renderMask();
  };

  const clearOverlay = () => {
    setCursor((prev) => ({ ...prev, visible: false }));
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    ctx?.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  };

  const resetFromPass = (pass: PassKey) => {
    const nextSaved = { ...savedPasses };
    const nextCounts = { ...maskCounts };
    const nextSame = { ...sameAsPrevious };
    for (let p = pass; p <= 3; p++) {
      nextSaved[p as PassKey] = false;
      nextCounts[p as PassKey] = 0;
      masksRef.current[p as PassKey] = createEmptyMask();
      if (p === 2 || p === 3) nextSame[p as 2 | 3] = false;
    }
    setSavedPasses(nextSaved);
    setMaskCounts(nextCounts);
    setSameAsPrevious(nextSame);
    setSelectedPass(pass);
    setSelectedTool("brush");
    setAnalysisViewed(false);
    setAnalysisData(null);
    requestAnimationFrame(() => {
      renderMask();
      clearOverlay();
    });
  };

  const handleSavePass = (pass: PassKey) => {
    if (!passEnabled(pass)) return;
    if (savedPasses[pass]) {
      resetFromPass(pass);
      return;
    }
    if (maskCounts[pass] <= 0) return;
    setSavedPasses((prev) => ({ ...prev, [pass]: true }));
    if (pass < 3) {
      const nextPass = (pass + 1) as PassKey;
      setSelectedPass(nextPass);
      setSelectedTool("brush");
      requestAnimationFrame(() => {
        renderMask();
        clearOverlay();
      });
    } else {
      clearOverlay();
    }
    setAnalysisData(null);
  };

  const handleCopyPrevious = (pass: 2 | 3, checked: boolean) => {
    if (!passEnabled(pass)) return;
    setSameAsPrevious((prev) => ({ ...prev, [pass]: checked }));
    if (checked) {
      const previousPass = (pass - 1) as PassKey;
      const clonedMask = new Uint8Array(masksRef.current[previousPass]);
      masksRef.current[pass] = clonedMask;
      setMaskCounts((prev) => ({ ...prev, [pass]: countMask(clonedMask) }));
    } else {
      masksRef.current[pass] = createEmptyMask();
      setMaskCounts((prev) => ({ ...prev, [pass]: 0 }));
    }
    setAnalysisData(null);
    if (selectedPass === pass) {
      requestAnimationFrame(() => {
        renderMask();
        clearOverlay();
      });
    }
  };

  const handleAnalyze = async () => {
    if (!hasSavedPass || !imageSrc) return;
    if (!selectedAge) {
      setShowAgeAlert(true);
      return;
    }

    const savedMasks: Uint8Array[] = [];
    if (savedPasses[1]) savedMasks.push(new Uint8Array(masksRef.current[1]));
    if (savedPasses[2]) savedMasks.push(new Uint8Array(masksRef.current[2]));
    if (savedPasses[3]) savedMasks.push(new Uint8Array(masksRef.current[3]));
    if (savedMasks.length === 0) return;

    try {
      setIsAnalyzing(true);
      const result = await computeAnalysis({
        imageSrc,
        displayScale,
        imageOffset,
        savedPassMasks: savedMasks,
        selectedAge,
      });
      pendingAnalysisScrollRef.current = true;
      setAnalysisData(result);
      setActiveNav("analysis");
      setAnalysisViewed(true);
    } catch (error) {
      console.error(error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <>
      <style jsx global>{`
        :root{
          --bg:#f4f5f9;
          --card:#fbfbfc;
          --line:#e7e9ef;
          --header:#3f4c66;
          --header-accent:#8eb4ff;
          --navy:#3f4c66;
          --blue:#2d66ff;
          --text:#1f1f1f;
          --shadow-btn:0 3px 8px rgba(52,74,99,.12);
          --sticky-top:64px;
        }
        *{box-sizing:border-box}
        html,body{margin:0;padding:0;background:var(--bg);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--text)}
        button,input{font:inherit}
        input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:10px;border-radius:999px;background:#d9e0ea;outline:none;margin:0}
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:22px;height:22px;border-radius:999px;border:0;background:#6a7d9a;box-shadow:0 2px 4px rgba(40,48,67,.2)}
        input[type=range]::-moz-range-thumb{width:22px;height:22px;border-radius:999px;border:0;background:#6a7d9a;box-shadow:0 2px 4px rgba(40,48,67,.2)}
        input[type=range]:disabled{opacity:.45}
        .page{min-height:100vh;background:var(--bg)}
        .header-shell{position:sticky;top:0;z-index:50;width:100%;background:var(--header)}
        .header-inner{width:100%;max-width:${DESKTOP_OUTER_WIDTH}px;height:${HEADER_HEIGHT}px;margin:0 auto;padding:0 18px;display:flex;align-items:center;justify-content:space-between}
        .header-left{display:flex;align-items:center;gap:28px;min-width:0}
        .brand{font-size:22px;font-weight:800;color:#fff;line-height:1;white-space:nowrap}
        .tagline{font-size:12px;color:var(--header-accent);line-height:1.1;white-space:nowrap}
        .header-right{display:flex;align-items:center;gap:12px;color:#fff}
        .username{font-size:12px;line-height:1;white-space:nowrap}
        .avatar{width:32px;height:32px;border-radius:999px;background:#eff4fb;color:#8b25ff;display:grid;place-items:center;flex:0 0 auto}
        .desktop-shell{width:${DESKTOP_OUTER_WIDTH}px;margin:0 auto;padding:10px 18px 28px;min-height:calc(100vh - 60px);overflow:hidden}
        .desktop-inner{width:${DESKTOP_INNER_WIDTH}px;display:grid;row-gap:0}
        .section-shell{width:${DESKTOP_INNER_WIDTH}px;position:relative}
        .info-shell{padding-bottom:0}
        .info-screen-lock{min-height:calc(100vh - 60px)}
        .section-grid-info{display:grid;grid-template-columns:${INFO_COL1}px ${INFO_GAP12}px ${INFO_COL2}px ${INFO_GAP23}px ${INFO_COL3}px;align-items:start}
        .section-grid-analysis{display:grid;grid-template-columns:${ANALYSIS_COL1}px ${ANALYSIS_GAP12}px ${ANALYSIS_COL2}px ${ANALYSIS_GAP23}px ${ANALYSIS_COL3}px;align-items:start}
        .sidebar-wrap{position:relative}
        .sidebar-sticky{position:sticky;top:var(--sticky-top)}
        .sidebar{width:100%;background:transparent}
        .side-nav{display:grid;gap:24px;margin-top:6px;margin-bottom:54px}
        .nav-btn{width:148px;height:38px;margin-left:20px;border-radius:12px;border:1px solid #495a79;background:#fff;color:#3d4a60;box-shadow:var(--shadow-btn);font-size:17px;font-weight:700;cursor:pointer}
        .nav-btn.active{background:var(--navy);color:#fff;box-shadow:0 0 0 1.5px rgba(89,129,255,.22),var(--shadow-btn)}
        .nav-btn.nav-btn-disabled{cursor:not-allowed}
        .sidebar-outline{width:100%;padding:0 10px 0 28px;display:grid;gap:42px}
        .side-title{margin:0;font-size:12px;line-height:1.2;font-weight:700;color:#202020}
        .side-title.active,.side-step.active{color:var(--blue)}
        .side-step-group{display:grid;gap:18px}
        .side-steps{display:grid;gap:16px;padding-left:24px}
        .side-step{margin:0;font-size:12px;line-height:1.25;font-weight:600;color:#222}
        .side-analysis-list{display:grid;gap:40px}
        .side-analysis-item{margin:0;font-size:12px;line-height:1.2;font-weight:700;color:#202020}
        .card{background:var(--card);border-radius:8px;box-shadow:inset 0 0 0 1px var(--line)}
        .top-card{width:${INFO_COL2 + INFO_GAP23 + INFO_COL3}px;min-height:210px;padding:18px 24px 22px}
        .top-card-grid{display:grid;grid-template-columns:1fr 1fr;column-gap:12px;align-items:start}
        .section-title{margin:0;font-size:16px;line-height:1.1;font-weight:800;color:#202020}
        .copy-block{display:grid;justify-items:end}
        .control-max-width{width:430px;display:grid;justify-items:end}
        .copy-title{margin:0;font-size:15px;line-height:1.25;font-weight:800;color:#222;text-align:right}
        .copy-sub{margin:4px 0 0 0;font-size:14px;line-height:1.25;color:#2f2f2f;text-align:right}
        .age-grid{width:430px;margin-top:62px;display:grid;grid-template-columns:repeat(4,100px);justify-content:start;gap:10px}
        .age-btn{width:100px;height:32px;border-radius:10px;border:1px solid #bebebe;background:#fff;color:#747474;font-size:12px;font-weight:500;cursor:pointer}
        .age-btn:hover{box-shadow:var(--shadow-btn)}
        .age-btn.active{background:var(--blue);border:1.5px solid var(--blue);color:#fff;box-shadow:var(--shadow-btn)}
        .guided-controls{width:430px;margin-top:62px;display:grid;grid-template-columns:repeat(3,137px);justify-content:start;gap:10px}
        .guided-col{display:grid;gap:12px}
        .tool-btn{width:137px;height:32px;border-radius:10px;border:1px solid #bebebe;background:#fff;color:#747474;font-size:12px;font-weight:500;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px}
        .tool-btn:hover{box-shadow:var(--shadow-btn)}
        .tool-btn.upload{border-color:var(--blue);color:var(--blue);font-weight:700}
        .tool-btn.active{background:var(--blue);border:1.5px solid var(--blue);color:#fff;box-shadow:var(--shadow-btn)}
        .lower-grid{width:${INFO_COL2 + INFO_GAP23 + INFO_COL3}px;display:grid;grid-template-columns:${INFO_COL2}px ${INFO_GAP23}px ${INFO_COL3}px;align-items:start;margin-top:11px}
        .photo-box{width:${PHOTO_SIZE}px;height:${PHOTO_SIZE}px;position:relative;overflow:hidden;border:2px dashed #8bb8ff;background:linear-gradient(0deg,rgba(45,102,255,.02),rgba(45,102,255,.02)),linear-gradient(90deg,rgba(45,102,255,.08) 1px,transparent 1px),linear-gradient(rgba(45,102,255,.08) 1px,transparent 1px);background-size:100% 100%,18px 18px,18px 18px;user-select:none;touch-action:none}
        .image-stage{position:absolute;inset:0;overflow:hidden}
        .photo-image{position:absolute;left:50%;top:50%;width:100%;height:100%;object-fit:contain;transform-origin:center center;-webkit-user-drag:none;user-select:none;pointer-events:none}
        .draw-canvas{position:absolute;inset:0;width:100%;height:100%;z-index:2;pointer-events:none}
        .photo-placeholder{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;color:var(--blue);pointer-events:none;z-index:1}
        .photo-placeholder-inner{display:flex;flex-direction:column;align-items:center;justify-content:center}
        .photo-label{margin-top:10px;font-size:20px;line-height:1.1;font-weight:700}
        .brush-cursor{position:absolute;border-radius:999px;border:2px solid #2d66ff;box-shadow:0 0 0 1px rgba(255,255,255,.95);background:rgba(45,102,255,.1);pointer-events:none;transform:translate(-50%,-50%);z-index:3}
        .erase-cursor{border-color:#ff5b5b;background:rgba(255,91,91,.1)}
        .pass-col{width:${INFO_COL3}px;height:${PHOTO_SIZE}px;display:grid;grid-template-rows:${PASS_CARD_HEIGHT}px ${PASS_CARD_HEIGHT}px ${PASS_CARD_HEIGHT}px ${ANALYZE_HEIGHT}px;row-gap:10px}
        .pass-card{width:${INFO_COL3}px;height:${PASS_CARD_HEIGHT}px;padding:16px 14px 14px;border-radius:12px;background:var(--card);box-shadow:inset 0 0 0 1px var(--line);display:grid;grid-template-rows:auto 1fr auto auto;gap:10px;cursor:pointer}
        .pass-card.current-only{background:var(--card);box-shadow:inset 0 0 0 1.5px var(--blue)}
        .pass-card.active{background:#eef4ff;box-shadow:inset 0 0 0 1.5px #89a9ff}
        .pass-card.disabled{cursor:not-allowed}
        .pass-title{margin:0;font-size:16px;line-height:1;font-weight:800;color:#151515;text-align:right}
        .pass-row{display:flex;justify-content:flex-end;align-items:center;gap:8px;font-size:12px;line-height:1.2;font-weight:700;color:#1f1f1f}
        .pass-row input{width:16px;height:16px;margin:0}
        .pass-meta{margin:0;min-height:12px;font-size:12px;line-height:1.25;color:#2d2d2d;text-align:right}
        .pass-btn{width:95px;height:32px;justify-self:end;border-radius:10px;border:1px solid #bebebe;background:#fff;color:#7b7b7b;font-size:12px;line-height:1;font-weight:500;cursor:pointer}
        .pass-btn.active{background:var(--blue);border:1.5px solid var(--blue);color:#fff;box-shadow:var(--shadow-btn)}
        .pass-btn:disabled{opacity:.45;cursor:not-allowed}
        .analyze-btn{width:${INFO_COL3}px;height:${ANALYZE_HEIGHT}px;border-radius:10px;border:1px solid #ff4343;background:#fff;color:#ff4343;font-size:16px;line-height:1;font-weight:700;cursor:default}
        .analyze-btn.outlined{border:1px solid #ff4343;background:#fff;color:#ff4343;box-shadow:var(--shadow-btn);cursor:pointer}
        .analyze-btn.active{font-size:16px;font-weight:700;background:#ff3131;border:1.5px solid #ff3131;color:#fff;box-shadow:var(--shadow-btn);cursor:pointer}
        .analysis-shell{width:${DESKTOP_INNER_WIDTH}px;min-height:calc(100vh - ${HEADER_HEIGHT}px - ${SECTION_TOP_GAP}px - 28px);padding-bottom:40px}
        .analysis-grid{display:grid;grid-template-columns:${ANALYSIS_COL1}px ${ANALYSIS_GAP12}px ${ANALYSIS_COL2}px ${ANALYSIS_GAP23}px ${ANALYSIS_COL3}px;align-items:start}
        .analysis-col-wrap{width:345px;display:grid;row-gap:11px}
        .analysis-pair{width:345px;background:var(--card);border-radius:8px;box-shadow:inset 0 0 0 1px var(--line);overflow:hidden;display:grid;row-gap:0}
        .analysis-white-card{width:345px;background:var(--card);border-radius:8px;box-shadow:inset 0 0 0 1px var(--line)}
        .analysis-pair .analysis-white-card{width:100%;background:transparent;border-radius:0;box-shadow:none}
        .analysis-white-pad20{padding:20px}
        .analysis-blue-card{width:345px;background:#eaf0ff;border-radius:8px;position:relative;z-index:2;overflow:hidden;box-shadow:inset 0 0 0 1px #155dfc}
        .analysis-pair .analysis-blue-card{width:100%;border-radius:8px;margin-top:0}
        .analysis-blue-pad26{padding:26px 25px}
        .analysis-note-card{width:345px;background:var(--card);border-radius:8px;box-shadow:inset 0 0 0 1px var(--line);padding:20px 20px 30px}
        .analysis-card-title{margin:0;font-size:16px;line-height:12px;font-weight:700;letter-spacing:0;color:#1A1A1A}
        .analysis-spacer-intensity{height:auto}
        .intensity-layout{padding:20px 0 0;display:flex;flex-direction:column;align-items:center}
        .intensity-circle-row{width:305px;margin:0 auto;display:flex;justify-content:space-between;align-items:center}
        .intensity-circle-item{width:72px;display:flex;justify-content:center;align-items:center;flex:0 0 auto}
        .intensity-circle-shell{width:57px;height:57px;border-radius:999px;background:#e9e9e9;display:grid;place-items:center}
        .intensity-circle-mid{width:47px;height:47px;border-radius:999px;background:#d7d7d7;display:grid;place-items:center}
        .intensity-circle-core{width:39px;height:39px;border-radius:999px}
        .intensity-buttons-row{width:305px;margin:10px auto 0;display:flex;justify-content:space-between;align-items:center}
        .intensity-pill{width:72px;height:25px;border-radius:999px;background:#fff;box-shadow:inset 0 0 0 1px #bfbfbf;display:inline-flex;align-items:center;justify-content:center;color:#bfbfbf;font-size:12px;line-height:20px;letter-spacing:-0.5px;font-weight:500;white-space:nowrap}
        .intensity-pill.active{width:74px;height:27px;box-shadow:inset 0 0 0 1.5px #ff383c;color:#727272}
        .analysis-spacer-consistency{height:auto}
        .consistency-layout{width:305px;margin:20px auto 0;display:flex;flex-direction:column;align-items:center}
        .consistency-row-3{width:305px;display:grid;grid-template-columns:repeat(3,1fr);justify-items:center;align-items:center}
        .consistency-circle-shell{width:57px;height:57px;border-radius:999px;background:#EFD5AE;display:grid;place-items:center}
        .consistency-circle-mid{border-radius:999px;background:#BF9482;display:grid;place-items:center}
        .consistency-circle-core{border-radius:999px;background:#755860}
        .consistency-buttons-row{margin-top:10px}
        .consistency-pill{height:25px;border-radius:999px;background:#fff;box-shadow:inset 0 0 0 1px #bfbfbf;display:inline-flex;align-items:center;justify-content:center;color:#bfbfbf;font-size:12px;line-height:20px;letter-spacing:-0.5px;font-weight:500;white-space:nowrap}
        .consistency-pill.low{width:72px}
        .consistency-pill.moderate{width:84px}
        .consistency-pill.high{width:72px}
        .consistency-pill.active{height:27px;box-shadow:inset 0 0 0 1.5px #ff383c;color:#727272}
        .consistency-pill.low.active{width:74px}
        .consistency-pill.moderate.active{width:86px}
        .consistency-pill.high.active{width:74px}
        .analysis-spacer-quant{height:198px}
        .analysis-blue-text{margin:0;color:#1f5eff;font-size:13px;line-height:1.45;font-weight:600;text-align:center}
        .analysis-note-text{margin:30px 0 0 0;color:#727272;font-size:12px;line-height:15px;letter-spacing:0;font-weight:400}
        .analysis-blue-center{max-width:294px;margin:0 auto}
        .quant-card{padding:30px}
        .quant-title{margin:-10px 0 30px -10px;font-size:16px;line-height:1.1;font-weight:800;color:#111}
        .quant-table{width:265px;margin:0 auto;display:grid;row-gap:14px}
        .quant-row{width:285px;display:grid;grid-template-columns:48px 138px 59px;column-gap:12px;align-items:center;height:20px}
        .quant-label{width:48px;margin:0;padding:0;color:#727272;font-size:11px;line-height:15px;letter-spacing:-0.2px;font-weight:600;text-align:left;white-space:nowrap}
        .quant-bar{width:138px;height:9px;border-radius:999px;background:#d9dce2;overflow:hidden;flex:0 0 auto}
        .quant-fill{height:9px;border-radius:999px}
        .quant-score{width:59px;margin:0;padding:0;color:#727272;font-size:11px;line-height:15px;letter-spacing:-0.2px;font-weight:400;text-align:right;white-space:nowrap}
        .analysis-blue-score-grid{width:295px;margin:0 auto;display:grid;grid-template-columns:118px 147px;column-gap:30px;align-items:start}
        .analysis-blue-score-label{margin:0 0 6px 0;color:#1f5eff;font-size:11px;line-height:15px;letter-spacing:-0.2px;font-weight:600;text-align:left;white-space:nowrap}
        .analysis-blue-score-value{margin:0;color:#1f5eff;font-size:17px;line-height:1.05;font-weight:700;text-align:left}
        .analysis-blue-score-meta{margin:6px 0 0 0;color:#1f5eff;font-size:13px;line-height:15px;letter-spacing:-0.2px;font-weight:600;text-align:left}
        .healing-stack{margin-top:30px;display:grid;row-gap:17px}
        .healing-stage-card{position:relative;width:100%;background:#fff;border-radius:8px}
        .healing-stage-card.expected{min-height:80px;box-shadow:inset 0 0 0 1px #33c45a}
        .healing-stage-card.visual{min-height:80px;box-shadow:inset 0 0 0 1px #ff8d28}
        .healing-stage-inner{min-height:80px;padding:13px 10px;display:grid;grid-template-columns:minmax(0,1fr) 45px;align-items:center;column-gap:14px}
        .healing-stage-copy{min-width:0;display:flex;flex-direction:column;justify-content:flex-start}
        .healing-stage-title{margin:0 0 8px 0;font-size:12px;line-height:15px;font-weight:700;letter-spacing:-0.45px;color:#1a1a1a}
        .healing-stage-line{margin:0;font-size:12px;line-height:15px;font-weight:400;letter-spacing:-0.2px;color:#727272}
        .healing-stage-badge{width:45px;height:45px;border-radius:999px;display:grid;place-items:center;flex:0 0 auto;font-size:12px;line-height:15px;font-weight:400;letter-spacing:-0.2px;color:#727272}
        .healing-stage-badge.expected{background:#cfffd8}
        .healing-stage-badge.visual{background:#ffe6d0}
        .healing-pointer{position:absolute;transform:translateX(-50%);width:7px;height:16.5px;filter:drop-shadow(0 0 0.8px rgba(255,255,255,.96))}
        .healing-pointer.expected{bottom:-16.5px;background:#33c45a;clip-path:polygon(50% 100%,0 0,100% 0)}
        .healing-pointer.visual{top:-16.5px;background:#ff8d28;clip-path:polygon(50% 0,0 100%,100% 100%)}
        .healing-stagebar-wrap{position:relative;width:100%;height:29px}
        .healing-stagebar{position:relative;width:100%;height:29px;border-radius:999px;overflow:hidden;background-image:url("data:image/png;base64,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");background-size:100% 100%;background-repeat:no-repeat;background-position:center}
        .analysis-note-top{display:flex;align-items:flex-start;justify-content:space-between}
        .note-icon{width:20px;height:20px;border-radius:999px;border:1px solid #8a8a8a;color:#8a8a8a;display:grid;place-items:center;font-size:12px;font-weight:700;flex:0 0 auto}
        .info-bottom-gap{height:${INFO_BOTTOM_GAP}px}
        .analysis-section-gap{height:${ANALYSIS_SWITCH_GAP}px}
        .analysis-top-gap{height:${SECTION_TOP_GAP}px}
        .alert-overlay{position:fixed;inset:0;background:rgba(18,24,38,.22);display:flex;align-items:center;justify-content:center;z-index:200}
        .alert-modal{width:360px;max-width:calc(100vw - 32px);background:#fff;border-radius:8px;box-shadow:0 18px 36px rgba(25,35,58,.18);padding:22px 22px 18px;text-align:center}
        .alert-message{margin:0;font-size:13px;line-height:1.45;font-weight:500;color:#232a38}
        .alert-actions{margin-top:14px;display:flex;justify-content:center}
        .alert-ok{min-width:82px;height:34px;border-radius:10px;border:1px solid #2d66ff;background:#2d66ff;color:#fff;font-size:12px;font-weight:600;cursor:pointer;box-shadow:var(--shadow-btn)}
        .mobile-fallback{display:none}
        @media (max-width:1199px){
          .desktop-shell{display:none}
          .mobile-fallback{display:grid;place-items:center;min-height:calc(100vh - ${HEADER_HEIGHT}px);padding:24px;text-align:center;color:#4a5568}
          .mobile-fallback-card{max-width:420px;background:#fff;border-radius:8px;padding:24px;box-shadow:0 10px 24px rgba(45,58,86,.08)}
        }
      `}</style>

      <div className="page">
        <header className="header-shell">
          <div className="header-inner">
            <div className="header-left">
              <div className="brand">BruiseTrace</div>
              <div className="tagline">Inclusive skin signal measurement system</div>
            </div>
            <div className="header-right">
              <div className="username">Io Kim</div>
              <div className="avatar"><UserIcon /></div>
            </div>
          </div>
        </header>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const url = URL.createObjectURL(file);
            setImageSrc(url);
            setSelectedTool(null);
            setCursor((prev) => ({ ...prev, visible: false }));
            setSavedPasses({ 1: false, 2: false, 3: false });
            setSameAsPrevious({ 2: false, 3: false });
            setMaskCounts({ 1: 0, 2: 0, 3: 0 });
            masksRef.current = { 1: createEmptyMask(), 2: createEmptyMask(), 3: createEmptyMask() };
            setSelectedPass(1);
            setAnalysisViewed(false);
            setAnalysisData(null);
            setImageOffset({ x: 0, y: 0 });
            setUploadSlider(0);
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext("2d");
            ctx?.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
          }}
        />

        <main className="desktop-shell">
          <div className="desktop-inner">
            <section ref={informationRef} className={`section-shell info-shell section-grid-info ${!analysisViewed ? "info-screen-lock" : ""}`}>
              <div className="sidebar-wrap">
                <div className="sidebar-sticky">
                  <div className="sidebar">
                    <div className="side-nav">
                      <button className={`nav-btn ${activeNav === "home" ? "active" : ""}`} onClick={() => setActiveNav("home")}>Home</button>
                      <button className={`nav-btn ${activeNav === "information" ? "active" : ""}`} onClick={scrollToInformation}>Information</button>
                      <button className={`nav-btn ${activeNav === "analysis" ? "active" : ""} ${!analysisViewed ? "nav-btn-disabled" : ""}`} onClick={() => { if (!analysisViewed) return; scrollToAnalysis(); }}>Analysis</button>
                    </div>

                    <div className="sidebar-outline">
                      <h4 className={`side-title ${selectedAge ? "active" : ""}`}>Estimated bruise age</h4>
                      <div className="side-step-group">
                        <h4 className={`side-title ${guidedDone ? "active" : ""}`}>Guided selection flow</h4>
                        <div className="side-steps">
                          <p className={`side-step ${imageSrc ? "active" : ""}`}>&gt; Upload Photo</p>
                          <p className={`side-step ${selectedTool === "brush" || maskCounts[1] > 0 ? "active" : ""}`}>&gt; Select the Brush</p>
                        </div>
                      </div>
                      <h4 className={`side-title ${analysisViewed ? "active" : ""}`}>Analyze</h4>
                    </div>
                  </div>
                </div>
              </div>

              <div />

              <div style={{ gridColumn: "3 / 6", display: "grid", rowGap: 11 }}>
                <div className="top-card card">
                  <div className="top-card-grid">
                    <h2 className="section-title">Estimated bruise age</h2>
                    <div className="copy-block">
                      <p className="copy-title">When did the bruise likely begin?</p>
                      <p className="copy-sub">Helps interpret bruise color stages.</p>
                      <div className="control-max-width">
                        <div className="age-grid">
                          {ageOptions.map((item) => (
                            <button key={item} className={`age-btn ${selectedAge === item ? "active" : ""}`} onClick={() => setSelectedAge((prev) => (prev === item ? null : item))}>
                              {item}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="top-card card">
                  <div className="top-card-grid">
                    <h2 className="section-title">Guided selection flow</h2>
                    <div className="copy-block">
                      <p className="copy-title">Select the bruise area using the brush (at least once).</p>
                      <p className="copy-sub">You may add up to 3 selections (Tight, Balanced, Broad) to improve reliability.</p>
                      <div className="control-max-width">
                        <div className="guided-controls">
                          <div className="guided-col">
                            <button className={`tool-btn upload ${uploadControlActive ? "active" : ""}`} onClick={() => { if (selectedTool === "brush" || selectedTool === "erase") { setSelectedTool(null); return; } fileInputRef.current?.click(); }}>
                              Upload Photo
                              <UploadIcon />
                            </button>
                            <input type="range" min="0" max="100" value={uploadSlider} disabled={!uploadControlActive} onChange={(e) => setUploadSlider(Number(e.target.value))} />
                          </div>
                          <div className="guided-col">
                            <button className={`tool-btn ${selectedTool === "brush" ? "active" : ""}`} onClick={() => setSelectedTool((prev) => (prev === "brush" ? null : "brush"))}>Bruise Select Brush</button>
                            <input type="range" min="0" max="100" value={brushSlider} disabled={selectedTool !== "brush"} onChange={(e) => setBrushSlider(Number(e.target.value))} />
                          </div>
                          <div className="guided-col">
                            <button className={`tool-btn ${selectedTool === "erase" ? "active" : ""}`} onClick={() => setSelectedTool((prev) => (prev === "erase" ? null : "erase"))}>Erase</button>
                            <input type="range" min="0" max="100" value={eraseSlider} disabled={selectedTool !== "erase"} onChange={(e) => setEraseSlider(Number(e.target.value))} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="lower-grid">
                  <div
                    ref={photoBoxRef}
                    className="photo-box"
                    style={{ cursor: uploadControlActive && imageSrc ? (panningRef.current ? "grabbing" : "grab") : "default" }}
                    onMouseEnter={(e) => {
                      if (selectedTool === "brush" || selectedTool === "erase") {
                        const point = getLocalPoint(e.clientX, e.clientY);
                        if (point) setCursor({ x: point.px, y: point.py, visible: true });
                      }
                    }}
                    onMouseLeave={() => {
                      drawingRef.current = false;
                      panningRef.current = false;
                      setCursor((prev) => ({ ...prev, visible: false }));
                    }}
                    onMouseMove={(e) => {
                      const point = getLocalPoint(e.clientX, e.clientY);
                      if (!point) return;
                      if (selectedTool === "brush" || selectedTool === "erase") setCursor({ x: point.px, y: point.py, visible: true });
                      if (drawingRef.current) applyBrush(e.clientX, e.clientY);
                      if (panningRef.current && uploadControlActive) {
                        const dx = e.clientX - panStartRef.current.x;
                        const dy = e.clientY - panStartRef.current.y;
                        setImageOffset({ x: panStartRef.current.startX + dx, y: panStartRef.current.startY + dy });
                      }
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      if (uploadControlActive && imageSrc) {
                        panningRef.current = true;
                        panStartRef.current = { x: e.clientX, y: e.clientY, startX: imageOffset.x, startY: imageOffset.y };
                        return;
                      }
                      if (selectedTool !== "brush" && selectedTool !== "erase") return;
                      if (!passEnabled(selectedPass)) return;
                      drawingRef.current = true;
                      applyBrush(e.clientX, e.clientY);
                    }}
                    onMouseUp={() => {
                      drawingRef.current = false;
                      panningRef.current = false;
                    }}
                    onDragStart={(e) => e.preventDefault()}
                  >
                    <div className="image-stage">
                      {imageSrc ? (
                        <>
                          <img src={imageSrc} alt="Bruise upload" className="photo-image" style={{ transform: `translate(calc(-50% + ${imageOffset.x}px), calc(-50% + ${imageOffset.y}px)) scale(${displayScale})` }} />
                          <canvas ref={canvasRef} className="draw-canvas" width={CANVAS_SIZE} height={CANVAS_SIZE} />
                        </>
                      ) : (
                        <canvas ref={canvasRef} className="draw-canvas" width={CANVAS_SIZE} height={CANVAS_SIZE} />
                      )}
                    </div>

                    {!imageSrc ? (
                      <div className="photo-placeholder">
                        <div className="photo-placeholder-inner">
                          <CameraIcon />
                          <div className="photo-label">Bruise Photo</div>
                        </div>
                      </div>
                    ) : null}

                    {cursor.visible && (selectedTool === "brush" || selectedTool === "erase") ? (
                      <div className={`brush-cursor ${selectedTool === "erase" ? "erase-cursor" : ""}`} style={{ left: cursor.x, top: cursor.y, width: brushRadius * 2, height: brushRadius * 2 }} />
                    ) : null}
                  </div>

                  <div />

                  <div className="pass-col">
                    {[1, 2, 3].map((pass) => {
                      const typedPass = pass as PassKey;
                      const enabled = passEnabled(typedPass);
                      const isSaved = savedPasses[typedPass];
                      const isGuide = typedPass === nextAvailablePass && !isSaved;
                      const labelCount = maskCounts[typedPass];
                      const canSave = enabled && labelCount > 0;

                      return (
                        <div
                          key={typedPass}
                          className={`pass-card ${isSaved ? "active" : isGuide ? "current-only" : ""} ${!enabled ? "disabled" : ""}`}
                          onClick={() => {
                            if (!enabled) return;
                            panningRef.current = false;
                            setSelectedPass(typedPass);
                            setSelectedTool("brush");
                            requestAnimationFrame(() => renderMask());
                          }}
                        >
                          <h3 className="pass-title">Pass {typedPass}</h3>
                          {typedPass > 1 ? (
                            <label className="pass-row">
                              <input
                                type="checkbox"
                                checked={sameAsPrevious[typedPass as 2 | 3]}
                                disabled={!enabled}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  handleCopyPrevious(typedPass as 2 | 3, e.target.checked);
                                }}
                              />
                              same as previous
                            </label>
                          ) : (
                            <div />
                          )}
                          <p className="pass-meta">{labelCount > 0 ? `Pass ${typedPass}: ${labelCount} px` : typedPass > 1 ? `Pass ${typedPass - 1}: ${maskCounts[(typedPass - 1) as PassKey]} px` : ""}</p>
                          <button className={`pass-btn ${isSaved ? "active" : ""}`} disabled={!isSaved && !canSave} onClick={(e) => { e.stopPropagation(); handleSavePass(typedPass); }}>
                            {isSaved ? "Cancel" : "Save"}
                          </button>
                        </div>
                      );
                    })}

                    <button className={`analyze-btn ${hasSavedPass ? "outlined" : ""} ${analyzeReady ? "active" : ""}`} disabled={!hasSavedPass || isAnalyzing} onClick={handleAnalyze}>
                      {isAnalyzing ? "Analyzing..." : "Analyze"}
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {analysisViewed && analysisData ? (
              <>
                <div className="info-bottom-gap" />
                <div className="analysis-section-gap" />

                <section ref={analysisRef} className="section-shell analysis-shell">
                  <div className="analysis-top-gap" />
                  <div className="analysis-grid">
                  <div className="sidebar-wrap">
                    <div className="sidebar-sticky">
                      <div className="sidebar">
                        <div className="side-nav">
                          <button className={`nav-btn ${activeNav === "home" ? "active" : ""}`} onClick={() => setActiveNav("home")}>Home</button>
                          <button className={`nav-btn ${activeNav === "information" ? "active" : ""}`} onClick={scrollToInformation}>Information</button>
                          <button className={`nav-btn ${activeNav === "analysis" ? "active" : ""}`} onClick={scrollToAnalysis}>Analysis</button>
                        </div>
                        <div className="sidebar-outline">
                          <p className="side-analysis-item">Healing interpretation</p>
                          <p className="side-analysis-item">Quantitative summary</p>
                          <p className="side-analysis-item">Bruise intensity</p>
                          <p className="side-analysis-item">Selection consistency</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div />

                  <div className="analysis-col-wrap">
                    <div className="analysis-pair">
                      <div className="analysis-white-card analysis-white-pad20">
                        <h3 className="analysis-card-title">Healing interpretation</h3>
                        <div className="healing-stack">
                          <div className="healing-stage-card expected">
                            <div className="healing-stage-inner">
                              <div className="healing-stage-copy">
                                <p className="healing-stage-title">Expected</p>
                                <p className="healing-stage-line">Expected stage (from reported timing)</p>
                                <p className="healing-stage-line">Typical healing stage for {selectedAge}: {stageLabel(expectedStage)}</p>
                              </div>
                              <div className="healing-stage-badge expected">{stageLabel(expectedStage)}</div>
                            </div>
                            <div className="healing-pointer expected" style={{ left: getPointerLeft(expectedStage) }} />
                          </div>

                          <div className="healing-stagebar-wrap">
                            <div className="healing-stagebar" />
                          </div>

                          <div className="healing-stage-card visual">
                            <div className="healing-pointer visual" style={{ left: getPointerLeft(visualStage) }} />
                            <div className="healing-stage-inner">
                              <div className="healing-stage-copy">
                                <p className="healing-stage-title">Visual</p>
                                <p className="healing-stage-line">Current visual stage (image-based)</p>
                                <p className="healing-stage-line">{analysisData.visualSummary}</p>
                              </div>
                              <div className="healing-stage-badge visual">{stageLabel(visualStage)}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="analysis-blue-card">
                        <div className="analysis-blue-pad26">
                          <p className="analysis-blue-text analysis-blue-center">{analysisData.healingText}</p>
                        </div>
                      </div>
                    </div>
                    <div className="analysis-pair">
                      <div className="analysis-white-card quant-card">
                        <h3 className="quant-title">Quantitative summary</h3>
                        <div className="quant-table">
                          <div className="quant-row">
                            <p className="quant-label">Red</p>
                            <div className="quant-bar"><div className="quant-fill" style={{ width: `${stageScores.red * 138}px`, background: "#f41616" }} /></div>
                            <p className="quant-score">{formatScore(stageScores.red)}</p>
                          </div>
                          <div className="quant-row">
                            <p className="quant-label">Blue</p>
                            <div className="quant-bar"><div className="quant-fill" style={{ width: `${stageScores.blue * 138}px`, background: "#2450db" }} /></div>
                            <p className="quant-score">{formatScore(stageScores.blue)}</p>
                          </div>
                          <div className="quant-row">
                            <p className="quant-label">Purple</p>
                            <div className="quant-bar"><div className="quant-fill" style={{ width: `${stageScores.purple * 138}px`, background: "#8f17df" }} /></div>
                            <p className="quant-score">{formatScore(stageScores.purple)}</p>
                          </div>
                          <div className="quant-row">
                            <p className="quant-label">Brown</p>
                            <div className="quant-bar"><div className="quant-fill" style={{ width: `${stageScores.brown * 138}px`, background: "#b26b3b" }} /></div>
                            <p className="quant-score">{formatScore(stageScores.brown)}</p>
                          </div>
                          <div className="quant-row">
                            <p className="quant-label">Yellow</p>
                            <div className="quant-bar"><div className="quant-fill" style={{ width: `${stageScores.yellow * 138}px`, background: "#f4bf3a" }} /></div>
                            <p className="quant-score">{formatScore(stageScores.yellow)}</p>
                          </div>
                        </div>
                      </div>
                      <div className="analysis-blue-card">
                        <div className="analysis-blue-pad26">
                          <div className="analysis-blue-score-grid">
                            <div>
                              <p className="analysis-blue-score-label">Bruise intensity score</p>
                              <p className="analysis-blue-score-value">{formatScore(analysisData.intensityScore)}</p>
                              <p className="analysis-blue-score-meta">{analysisData.intensityLabel}</p>
                            </div>
                            <div>
                              <p className="analysis-blue-score-label">Selection consistency score</p>
                              <p className="analysis-blue-score-value">{formatScore(analysisData.consistencyScore)}</p>
                              <p className="analysis-blue-score-meta">{analysisData.consistencyLabel}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div />

                  <div className="analysis-col-wrap">
                    <div className="analysis-pair">
                      <div className="analysis-white-card analysis-white-pad20">
                        <h3 className="analysis-card-title">Bruise intensity</h3>
                        <div className="intensity-layout">
                          <div className="intensity-circle-row">
                            <div className="intensity-circle-item">
                              <div className="intensity-circle-shell" style={{ background: "#FFF3D9" }}>
                                <div className="intensity-circle-mid" style={{ background: "#F2D0A9" }}>
                                  <div className="intensity-circle-core" style={{ background: "#DFAD8C" }} />
                                </div>
                              </div>
                            </div>
                            <div className="intensity-circle-item">
                              <div className="intensity-circle-shell" style={{ background: "#F8D9A8" }}>
                                <div className="intensity-circle-mid" style={{ background: "#D0926F" }}>
                                  <div className="intensity-circle-core" style={{ background: "#9E755E" }} />
                                </div>
                              </div>
                            </div>
                            <div className="intensity-circle-item">
                              <div className="intensity-circle-shell" style={{ background: "#D3A488" }}>
                                <div className="intensity-circle-mid" style={{ background: "#A07262" }}>
                                  <div className="intensity-circle-core" style={{ background: "#6C504A" }} />
                                </div>
                              </div>
                            </div>
                            <div className="intensity-circle-item">
                              <div className="intensity-circle-shell" style={{ background: "#B0827A" }}>
                                <div className="intensity-circle-mid" style={{ background: "#71494C" }}>
                                  <div className="intensity-circle-core" style={{ background: "#2B1E2F" }} />
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="intensity-buttons-row">
                            {(["Moderate", "Mild", "Strong", "Very Strong"] as IntensityLabel[]).map((label) => (
                              <div className="intensity-circle-item" key={label}><div className={`intensity-pill ${analysisData.intensityLabel === label ? "active" : ""}`}>{label}</div></div>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="analysis-blue-card">
                        <div className="analysis-blue-pad26">
                          <p className="analysis-blue-text analysis-blue-center">{analysisData.intensitySummary}</p>
                        </div>
                      </div>
                    </div>
                    <div className="analysis-pair">
                      <div className="analysis-white-card analysis-white-pad20">
                        <h3 className="analysis-card-title">Selection consistency</h3>
                        <div className="consistency-layout">
                          <div className="consistency-row-3">
                            <div className="consistency-circle-shell" style={{ background: "#EFD5AE" }}>
                              <div className="consistency-circle-mid" style={{ width: "43px", height: "43px", background: "#BF9482" }}>
                                <div className="consistency-circle-core" style={{ width: "29px", height: "29px", background: "#755860" }} />
                              </div>
                            </div>
                            <div className="consistency-circle-shell" style={{ background: "#EFD5AE" }}>
                              <div className="consistency-circle-mid" style={{ width: "47px", height: "47px", background: "#BF9482" }}>
                                <div className="consistency-circle-core" style={{ width: "37px", height: "37px", background: "#755860" }} />
                              </div>
                            </div>
                            <div className="consistency-circle-shell" style={{ background: "#EFD5AE" }}>
                              <div className="consistency-circle-mid" style={{ width: "51px", height: "51px", background: "#BF9482" }}>
                                <div className="consistency-circle-core" style={{ width: "45px", height: "45px", background: "#755860" }} />
                              </div>
                            </div>
                          </div>
                          <div className="consistency-row-3 consistency-buttons-row">
                            <div className={`consistency-pill low ${analysisData.consistencyLabel === "Low" ? "active" : ""}`}>Low</div>
                            <div className={`consistency-pill moderate ${analysisData.consistencyLabel === "Moderate" ? "active" : ""}`}>Moderate</div>
                            <div className={`consistency-pill high ${analysisData.consistencyLabel === "High" ? "active" : ""}`}>High</div>
                          </div>
                        </div>
                      </div>
                      <div className="analysis-blue-card">
                        <div className="analysis-blue-pad26">
                          <p className="analysis-blue-text analysis-blue-center">{analysisData.consistencySummary}</p>
                        </div>
                      </div>
                    </div>
                    <div className="analysis-note-card">
                      <div className="analysis-note-top">
                        <h3 className="analysis-card-title">Analysis note</h3>
                        <div className="note-icon">i</div>
                      </div>
                      <p className="analysis-note-text">
                        This tool provides an image-based interpretation only
                        and does not diagnose a medical condition. Lighting,
                        skin tone, camera quality, and selection choices can
                        affect the result. Repeat photos taken 24 hours or more
                        apart are more useful for recovery tracking.
                      </p>
                    </div>
                  </div>
                  </div>
                </section>
              </>
            ) : null}
          </div>
        </main>

        {showAgeAlert ? (
          <div className="alert-overlay" onClick={() => setShowAgeAlert(false)}>
            <div className="alert-modal" onClick={(e) => e.stopPropagation()}>
              <p className="alert-message">Please select the estimated bruise age before analyzing.</p>
              <div className="alert-actions">
                <button className="alert-ok" onClick={() => setShowAgeAlert(false)}>OK</button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mobile-fallback">
          <div className="mobile-fallback-card">Desktop analysis layout shell only</div>
        </div>
      </div>
    </>
  );
}
