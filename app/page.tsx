"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const DESKTOP_OUTER_WIDTH = 940;
const DESKTOP_INNER_WIDTH = 904;
const HEADER_HEIGHT = 50;
const SECTION_TOP_GAP = 10;

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
    return { red: 0.2, blue: 0.2, purple: 0.2, brown: 0.2, yellow: 0.2 };
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

function stageBarColor(stage: StageKey) {
  switch (stage) {
    case "red":
      return "#f41616";
    case "blue":
      return "#2450db";
    case "purple":
      return "#8f17df";
    case "brown":
      return "#b26b3b";
    case "yellow":
      return "#f4bf3a";
  }
}

function getExpectedStage(age: string | null): StageKey {
  switch (age) {
    case "Within 24h":
    case "1-2 days":
      return "red";
    case "3-4 days":
      return "blue";
    case "5-7 days":
      return "purple";
    case "8-10 days":
      return "brown";
    case "11-13 days":
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

  if (delta === 0) {
    return `Healing appears broadly in line with the reported timing. The current visual stage is close to the expected ${stageLabel(expectedStage)} stage.`;
  }
  if (delta === 1) {
    return `Healing appears slightly later in the healing sequence than expected. The current visual stage looks somewhat more advanced than the expected ${stageLabel(expectedStage)} stage.`;
  }
  if (delta >= 2) {
    return `Healing appears noticeably later in the healing sequence than expected. The current visual stage looks more advanced than the expected ${stageLabel(expectedStage)} stage for the reported timing.`;
  }
  if (delta === -1) {
    return `Healing appears slightly slower than expected. The current visual stage looks somewhat earlier in the healing sequence than the expected ${stageLabel(expectedStage)} stage.`;
  }
  return `Healing appears slower than expected. The current visual stage looks earlier in the healing sequence than the expected ${stageLabel(expectedStage)} stage for the reported timing.`;
}

function getPointerLeft(stage: StageKey) {
  const order: StageKey[] = ["red", "blue", "purple", "brown", "yellow"];
  const index = order.indexOf(stage);
  return `${10 + index * 20}%`;
}

function rgbToHsv(r: number, g: number, b: number) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  if (d !== 0) {
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }
  return { h: h * 360, s, v };
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
  return union === 0 ? 0 : intersection / union;
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
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");

  const drawWidth = CANVAS_SIZE * displayScale;
  const drawHeight = CANVAS_SIZE * displayScale;
  const dx = (CANVAS_SIZE - drawWidth) / 2 + imageOffset.x;
  const dy = (CANVAS_SIZE - drawHeight) / 2 + imageOffset.y;
  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  ctx.drawImage(img, dx, dy, drawWidth, drawHeight);
  const pixels = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE).data;

  const mask = new Uint8Array(CANVAS_SIZE * CANVAS_SIZE);
  for (let i = 0; i < mask.length; i++) {
    let total = 0;
    for (const saved of savedPassMasks) total += saved[i] ? 1 : 0;
    mask[i] = total >= Math.max(1, Math.ceil(savedPassMasks.length / 2)) ? 1 : 0;
  }

  const stageRaw: Record<StageKey, number> = { red: 0.001, blue: 0.001, purple: 0.001, brown: 0.001, yellow: 0.001 };
  const stageCoverage: Record<StageKey, number> = { red: 0, blue: 0, purple: 0, brown: 0, yellow: 0 };

  let count = 0;
  let bruiseLike = 0;
  let sumV = 0;
  let sumS = 0;
  let sumSpread = 0;
  let sumContrast = 0;

  const hueDistance = (a: number, b: number) => {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  };

  const closeness = (h: number, center: number, width: number) => clamp(1 - hueDistance(h, center) / width, 0, 1);

  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const idx = i * 4;
    const r = pixels[idx] / 255;
    const g = pixels[idx + 1] / 255;
    const b = pixels[idx + 2] / 255;
    const maxCh = Math.max(r, g, b);
    const minCh = Math.min(r, g, b);
    const spread = maxCh - minCh;
    const contrast = Math.abs(r - g) + Math.abs(r - b) + Math.abs(g - b);
    const { h, s, v } = rgbToHsv(r, g, b);

    count++;
    sumV += v;
    sumS += s;
    sumSpread += spread;
    sumContrast += contrast;

    const darkFactor = clamp((0.82 - v) / 0.55, 0, 1);
    const midDarkFactor = clamp((0.72 - v) / 0.42, 0, 1);
    const brightFactor = clamp((v - 0.36) / 0.5, 0, 1);
    const satFactor = clamp((s - 0.06) / 0.42, 0, 1);
    const yellowSafe = 1 - closeness(h, 58, 24) * clamp((v - 0.45) / 0.4, 0, 1);
    const brownSafe = 1 - closeness(h, 32, 20) * clamp((0.82 - v) / 0.5, 0, 1);
    const redDominance = clamp((r - Math.max(g, b)) / 0.22, 0, 1);
    const blueDominance = clamp((b - r) / 0.22, 0, 1);

    const redLike = closeness(h, 2, 18) * satFactor * clamp((0.74 - v) / 0.34, 0, 1) * (0.4 + 0.6 * redDominance) * yellowSafe * brownSafe;
    const blueLike = closeness(h, 232, 34) * satFactor * clamp((0.8 - v) / 0.46, 0, 1) * (0.35 + 0.65 * blueDominance);
    const purpleLike = Math.max(closeness(h, 285, 44), closeness(h, 320, 34) * 0.72) * satFactor * (0.45 + 0.55 * darkFactor);
    const brownLike = closeness(h, 28, 24) * clamp((0.84 - v) / 0.56, 0, 1) * clamp((s - 0.02) / 0.3, 0, 1);
    const yellowLike = closeness(h, 58, 24) * brightFactor * clamp((s - 0.03) / 0.28, 0, 1);

    stageRaw.red += redLike;
    stageRaw.blue += blueLike;
    stageRaw.purple += purpleLike;
    stageRaw.brown += brownLike;
    stageRaw.yellow += yellowLike;

    if (redLike > 0.18) stageCoverage.red++;
    if (blueLike > 0.14) stageCoverage.blue++;
    if (purpleLike > 0.14) stageCoverage.purple++;
    if (brownLike > 0.12) stageCoverage.brown++;
    if (yellowLike > 0.12) stageCoverage.yellow++;

    if (satFactor > 0.08 && contrast > 0.08 && v < 0.92) bruiseLike++;
  }

  if (count === 0) throw new Error("No selected pixels available for analysis");

  const avgBrightness = sumV / count;
  const avgSaturation = sumS / count;
  const avgSpread = sumSpread / count;
  const avgContrast = sumContrast / count;
  const bruiseLikeRatio = bruiseLike / count;

  const coverageRatio = {
    red: stageCoverage.red / count,
    blue: stageCoverage.blue / count,
    purple: stageCoverage.purple / count,
    brown: stageCoverage.brown / count,
    yellow: stageCoverage.yellow / count,
  };

  stageRaw.red += coverageRatio.red * 0.22;
  stageRaw.blue += coverageRatio.blue * 0.2;
  stageRaw.purple += coverageRatio.purple * 0.24;
  stageRaw.brown += coverageRatio.brown * 0.18;
  stageRaw.yellow += coverageRatio.yellow * 0.2;

  if (coverageRatio.purple > 0.1 && coverageRatio.yellow > 0.08) {
    stageRaw.red *= 0.52;
    stageRaw.purple *= 1.16;
    stageRaw.brown *= 1.04;
    stageRaw.yellow *= 1.08;
  }

  if (coverageRatio.brown > 0.08 && coverageRatio.yellow > 0.08) {
    stageRaw.red *= 0.45;
    stageRaw.brown *= 1.1;
    stageRaw.yellow *= 1.18;
  }

  if (coverageRatio.purple > 0.12 && coverageRatio.red > 0.06) {
    stageRaw.red *= 0.66;
    stageRaw.purple *= 1.12;
  }

  if (coverageRatio.yellow > 0.12 && avgBrightness > 0.44) {
    stageRaw.red *= 0.42;
    stageRaw.brown *= 1.02;
    stageRaw.yellow *= 1.12;
  }

  if (coverageRatio.blue > 0.08 && coverageRatio.purple > 0.1) {
    stageRaw.blue *= 1.08;
    stageRaw.purple *= 1.08;
    stageRaw.red *= 0.72;
  }

  if (coverageRatio.red < 0.045) {
    stageRaw.red *= 0.32;
  }

  if (avgBrightness > 0.56 && avgSaturation < 0.16) {
    stageRaw.red *= 0.28;
  }

  if (avgContrast < 0.24 && coverageRatio.red < 0.08) {
    stageRaw.red *= 0.55;
  }

  if (avgBrightness < 0.46 && coverageRatio.purple > 0.1 && coverageRatio.red > coverageRatio.purple) {
    stageRaw.red *= 0.7;
    stageRaw.purple *= 1.08;
  }

  const stageScores = normalizeStageScores(stageRaw);
  const sortedStages = (Object.entries(stageScores) as Array<[StageKey, number]>).sort((a, b) => b[1] - a[1]);
  const topStage = sortedStages[0][0];
  const topScore = sortedStages[0][1];
  const secondStage = sortedStages[1][0];
  const secondScore = sortedStages[1][1];
  let visualStage: StageKey = topStage;

  const purpleStrong = stageScores.purple >= 0.34;
  const purpleNearTop = stageScores.purple >= topScore * 0.82;
  const purpleCoverageStrong = coverageRatio.purple >= 0.09;
  const redClearlyDominant = stageScores.red >= 0.42 && stageScores.red - stageScores.purple >= 0.1;
  const brownClearlyDominant =
    stageScores.brown >= 0.38 &&
    stageScores.yellow >= 0.12 &&
    stageScores.brown - stageScores.purple >= 0.08;

  if (topStage === "purple") {
    visualStage = "purple";
  } else if (topStage === "red") {
    visualStage = !redClearlyDominant && (purpleStrong || purpleNearTop || purpleCoverageStrong) ? "purple" : "red";
  } else if (topStage === "brown") {
    visualStage = brownClearlyDominant ? "brown" : (purpleStrong || purpleNearTop || purpleCoverageStrong ? "purple" : "brown");
  } else if (topStage === "yellow") {
    visualStage = stageScores.brown >= 0.24 ? "brown" : "yellow";
  } else if (topStage === "blue") {
    visualStage = stageScores.purple >= 0.3 && secondStage === "purple" ? "purple" : "blue";
  }

  const expectedStage = getExpectedStage(selectedAge);
  const darkness = 1 - avgBrightness;
  const intensityScore = clamp(darkness * 0.48 + avgSaturation * 0.18 + avgSpread * 0.16 + avgContrast * 0.1 + bruiseLikeRatio * 0.08, 0, 1);
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

  return {
    stageScores,
    visualStage,
    expectedStage,
    healingText: getHealingMessage(expectedStage, visualStage),
    intensityScore,
    intensityLabel,
    consistencyScore,
    consistencyLabel,
    visualSummary: `The image most closely matches the ${stageLabel(visualStage)} stage.`,
    intensitySummary: `The selected bruise core appears ${intensityLabel === "Very Strong" ? "very dark && visually concentrated" : intensityLabel === "Strong" ? "noticeably dark overall" : intensityLabel === "Moderate" ? "moderately visible in contrast" : "relatively light overall"}. The overall intensity is interpreted as ${intensityLabel}.`,
    consistencySummary: `This reflects how similar your bruise boundary selections were across repeated passes. The current result is ${consistencyLabel.toLowerCase()}, based on overlap across saved passes.`,
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
  const [showEditLockedAlert, setShowEditLockedAlert] = useState(false);
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const photoBoxRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const informationRef = useRef<HTMLDivElement | null>(null);
  const analysisRef = useRef<HTMLDivElement | null>(null);
  const pendingAnalysisScrollRef = useRef(false);

  const drawingRef = useRef(false);
  const panningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, startX: 0, startY: 0 });
  const lastDrawPointRef = useRef<{ x: number; y: number } | null>(null);

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
  const allPassesSaved = savedPasses[1] && savedPasses[2] && savedPasses[3];
  const editingLocked = analysisViewed || allPassesSaved;
  const analyzeReady = Boolean(selectedAge) && hasSavedPass;

  useEffect(() => {
    setDisplayScale(1 + (uploadSlider / 100) * 0.8);
  }, [uploadSlider]);

  useEffect(() => {
    if (!analysisViewed || !analysisRef.current) {
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
  }, [analysisViewed]);

  useEffect(() => {
    if (!analysisViewed || activeNav !== "analysis" || !analysisRef.current) return;
    requestAnimationFrame(() => {
      const y = window.scrollY + analysisRef.current!.getBoundingClientRect().top - HEADER_HEIGHT - SECTION_TOP_GAP;
      window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
    });
  }, [analysisViewed, activeNav]);

  useEffect(() => {
    if (!analysisViewed || !analysisData || !pendingAnalysisScrollRef.current || !analysisRef.current) return;
    const run = () => {
      if (!analysisRef.current) return;
      const y = window.scrollY + analysisRef.current.getBoundingClientRect().top - HEADER_HEIGHT - SECTION_TOP_GAP;
      window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
      setActiveNav("analysis");
      pendingAnalysisScrollRef.current = false;
    };
    const id1 = requestAnimationFrame(() => requestAnimationFrame(run));
    return () => cancelAnimationFrame(id1);
  }, [analysisViewed, analysisData]);

  const passEnabled = (pass: PassKey) => (pass === 1 ? true : pass === 2 ? savedPasses[1] : savedPasses[2]);
  const nextAvailablePass: PassKey = savedPasses[1] ? (savedPasses[2] ? 3 : 2) : 1;

  const openEditLockedAlert = () => {
    setShowEditLockedAlert(true);
  };

  const scrollToInformation = () => {
    setActiveNav("information");
    if (!informationRef.current) return;
    const y = window.scrollY + informationRef.current.getBoundingClientRect().top - HEADER_HEIGHT - SECTION_TOP_GAP;
    window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
  };

  const scrollToAnalysis = () => {
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
    if (!passEnabled(selectedPass) || editingLocked) return;
    const point = getLocalPoint(clientX, clientY);
    if (!point) return;
    const mask = masksRef.current[selectedPass];
    const fillValue: 0 | 1 = selectedTool === "brush" ? 1 : 0;
    const previousPoint = lastDrawPointRef.current;

    if (!previousPoint) {
      drawCircle(mask, point.x, point.y, brushRadius, fillValue);
    } else {
      const dx = point.x - previousPoint.x;
      const dy = point.y - previousPoint.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const stepSize = Math.max(1, brushRadius * 0.35);
      const steps = Math.max(1, Math.ceil(distance / stepSize));

      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const ix = previousPoint.x + dx * t;
        const iy = previousPoint.y + dy * t;
        drawCircle(mask, ix, iy, brushRadius, fillValue);
      }
    }

    lastDrawPointRef.current = { x: point.x, y: point.y };
    setMaskCounts((prev) => ({ ...prev, [selectedPass]: countMask(mask) }));
    setCursor({ x: point.px, y: point.py, visible: true });
    renderMask();
  };

  const clearOverlay = () => {
    lastDrawPointRef.current = null;
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
    setShowEditLockedAlert(false);
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
      setSelectedTool(null);
      clearOverlay();
    }
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
      setSelectedTool(null);
      clearOverlay();
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
        .info-shell{padding-bottom:20px}
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
        .analysis-shell{width:${DESKTOP_INNER_WIDTH}px;padding-top:10px;min-height:calc(100vh - ${HEADER_HEIGHT}px - ${SECTION_TOP_GAP}px);padding-bottom:24px}
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
        .analysis-blue-pad26{padding:26px 25px}
        .analysis-blue-score-grid{width:295px;margin:0 auto;display:grid;grid-template-columns:118px 147px;column-gap:30px;align-items:start}
        .analysis-blue-score-label{margin:0 0 6px 0;color:#1f5eff;font-size:11px;line-height:15px;letter-spacing:-0.2px;font-weight:600;text-align:left;white-space:nowrap}
        .analysis-blue-score-value{margin:0;color:#1f5eff;font-size:17px;line-height:1.05;font-weight:700;text-align:left}
        .analysis-blue-score-meta{margin:6px 0 0 0;color:#1f5eff;font-size:13px;line-height:15px;letter-spacing:-0.2px;font-weight:600;text-align:left}
        .healing-stack{margin-top:30px;display:grid;row-gap:17px}
        .healing-stage-card{position:relative;width:100%;background:#fff;border-radius:8px}
        .healing-stage-card.expected{min-height:65px;height:auto;box-shadow:inset 0 0 0 1px #33c45a}
        .healing-stage-card.visual{min-height:80px;height:auto;box-shadow:inset 0 0 0 1px #ff8d28}
        .healing-stage-inner{padding:13px 10px;display:flex;align-items:center;justify-content:space-between;gap:14px}
        .healing-stage-copy{min-width:0;display:flex;flex-direction:column;justify-content:center}
        .healing-stage-title{margin:0 0 8px 0;font-size:12px;line-height:15px;font-weight:700;letter-spacing:-0.45px;color:#1a1a1a}
        .healing-stage-line{margin:0;font-size:12px;line-height:15px;font-weight:400;letter-spacing:-0.2px;color:#727272}
        .healing-stage-badge{width:45px;height:45px;border-radius:999px;display:grid;place-items:center;flex:0 0 auto;font-size:12px;line-height:15px;font-weight:400;letter-spacing:-0.2px;color:#727272}
        .healing-stage-badge.expected{background:#cfffd8}
        .healing-stage-badge.visual{background:#ffe6d0}
        .healing-pointer{position:absolute;left:50%;transform:translateX(-50%);width:6px;height:16.5px}
        .healing-pointer.expected{bottom:-16.5px;background:#33c45a;clip-path:polygon(50% 100%,0 0,100% 0)}
        .healing-pointer.visual{top:-16.5px;background:#ff8d28;clip-path:polygon(50% 0,0 100%,100% 100%)}
        .healing-stagebar-wrap{position:relative;width:100%;height:29px}
        .healing-stagebar{
  position:relative;
  width:100%;
  height:29px;
  border-radius:999px;
  overflow:hidden;
  background-image:url("/color bar.png?v=2");
  background-size:100% 100%;
  background-repeat:no-repeat;
  background-position:center;
}
        .healing-stagebar-labels{display:none}
        .healing-stage-seg{position:relative;display:grid;place-items:center;font-size:13px;line-height:0;font-weight:600;letter-spacing:0}
        .healing-stage-seg.s1,.healing-stage-seg.s2,.healing-stage-seg.s3,.healing-stage-seg.s4{color:#fff}
        .healing-stage-seg.s5{color:#111}
        
        .analysis-note-top{display:flex;align-items:flex-start;justify-content:space-between}
        .note-icon{width:20px;height:20px;border-radius:999px;border:1px solid #8a8a8a;color:#8a8a8a;display:grid;place-items:center;font-size:12px;font-weight:700;flex:0 0 auto}
        .analysis-section-gap{height:0}
        .alert-overlay{position:fixed;inset:0;background:rgba(18,24,38,.22);display:flex;align-items:center;justify-content:center;z-index:200}
        .alert-modal{width:360px;max-width:calc(100vw - 32px);background:#fff;border-radius:8px;box-shadow:0 18px 36px rgba(25,35,58,.18);padding:22px 22px 18px;text-align:center}
        .alert-message{margin:0;font-size:13px;line-height:1.45;font-weight:500;color:#232a38}
        .alert-actions{margin-top:14px;display:flex;justify-content:center;gap:10px;flex-wrap:wrap}
        .alert-ok{min-width:82px;height:34px;border-radius:10px;border:1px solid #2d66ff;background:#2d66ff;color:#fff;font-size:12px;font-weight:600;cursor:pointer;box-shadow:var(--shadow-btn)}
        .alert-secondary{min-width:160px;height:34px;border-radius:10px;border:1px solid #c4cada;background:#fff;color:#4c566d;font-size:12px;font-weight:600;cursor:pointer}
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
            setShowEditLockedAlert(false);
            setImageOffset({ x: 0, y: 0 });
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
                            <button className={`tool-btn ${selectedTool === "brush" ? "active" : ""}`} onClick={() => { if (editingLocked) { openEditLockedAlert(); return; } setSelectedTool((prev) => (prev === "brush" ? null : "brush")); }}>Bruise Select Brush</button>
                            <input type="range" min="0" max="100" value={brushSlider} disabled={selectedTool !== "brush" || editingLocked} onChange={(e) => setBrushSlider(Number(e.target.value))} />
                          </div>
                          <div className="guided-col">
                            <button className={`tool-btn ${selectedTool === "erase" ? "active" : ""}`} onClick={() => { if (editingLocked) { openEditLockedAlert(); return; } setSelectedTool((prev) => (prev === "erase" ? null : "erase")); }}>Erase</button>
                            <input type="range" min="0" max="100" value={eraseSlider} disabled={selectedTool !== "erase" || editingLocked} onChange={(e) => setEraseSlider(Number(e.target.value))} />
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
                    style={{ cursor: editingLocked ? "not-allowed" : uploadControlActive && imageSrc ? (panningRef.current ? "grabbing" : "grab") : "default" }}
                    onMouseEnter={(e) => {
                      if ((selectedTool === "brush" || selectedTool === "erase") && !editingLocked) {
                        const point = getLocalPoint(e.clientX, e.clientY);
                        if (point) setCursor({ x: point.px, y: point.py, visible: true });
                      }
                    }}
                    onMouseLeave={() => {
                      drawingRef.current = false;
                      panningRef.current = false;
                      lastDrawPointRef.current = null;
                      setCursor((prev) => ({ ...prev, visible: false }));
                    }}
                    onMouseMove={(e) => {
                      const point = getLocalPoint(e.clientX, e.clientY);
                      if (!point) return;
                      if ((selectedTool === "brush" || selectedTool === "erase") && !editingLocked) setCursor({ x: point.px, y: point.py, visible: true });
                      if (drawingRef.current) applyBrush(e.clientX, e.clientY);
                      if (panningRef.current && uploadControlActive && !editingLocked) {
                        const dx = e.clientX - panStartRef.current.x;
                        const dy = e.clientY - panStartRef.current.y;
                        setImageOffset({ x: panStartRef.current.startX + dx, y: panStartRef.current.startY + dy });
                      }
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      if (editingLocked && imageSrc) {
                        openEditLockedAlert();
                        return;
                      }
                      if (uploadControlActive && imageSrc) {
                        panningRef.current = true;
                        panStartRef.current = { x: e.clientX, y: e.clientY, startX: imageOffset.x, startY: imageOffset.y };
                        return;
                      }
                      if (selectedTool !== "brush" && selectedTool !== "erase") return;
                      if (!passEnabled(selectedPass)) return;
                      drawingRef.current = true;
                      lastDrawPointRef.current = null;
                      applyBrush(e.clientX, e.clientY);
                    }}
                    onMouseUp={() => {
                      drawingRef.current = false;
                      panningRef.current = false;
                      lastDrawPointRef.current = null;
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
                            if (editingLocked) {
                              openEditLockedAlert();
                              return;
                            }
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

                    <button
                      className={`analyze-btn ${hasSavedPass ? "outlined" : ""} ${analyzeReady ? "active" : ""}`}
                      disabled={!hasSavedPass}
                      onClick={handleAnalyze}
                    >
                      {isAnalyzing ? "Analyzing..." : "Analyze"}
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {analysisViewed ? (
              <>
                <div className="analysis-section-gap" />

                <section ref={analysisRef} className="section-shell section-grid-analysis analysis-shell">
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
                            <p className="healing-stage-line">{`Typical healing stage for ${selectedAge ?? "Unknown"}: ${stageLabel(analysisData?.expectedStage ?? "purple")}`}</p>
                          </div>
                          <div className="healing-stage-badge expected">{stageLabel(analysisData?.expectedStage ?? "yellow")}</div>
                        </div>
                        <div className="healing-pointer expected" style={{ left: getPointerLeft(analysisData?.expectedStage ?? "yellow") }} />
                      </div>

                      <div className="healing-stagebar-wrap">
                        <div className="healing-stagebar">

                        </div>
                      </div>

                      <div className="healing-stage-card visual">
                        <div className="healing-pointer visual" style={{ left: getPointerLeft(analysisData?.visualStage ?? "red") }} />
                        <div className="healing-stage-inner">
                          <div className="healing-stage-copy">
                            <p className="healing-stage-title">Visual</p>
                            <p className="healing-stage-line">Current visual stage (image-based)</p>
                            <p className="healing-stage-line">{analysisData?.visualSummary ?? "The image most closely matches the Yellow stage."}</p>
                          </div>
                          <div className="healing-stage-badge visual">{stageLabel(analysisData?.visualStage ?? "red")}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="analysis-blue-card">
                    <div className="analysis-blue-pad26">
                      <p className="analysis-blue-text analysis-blue-center">
                        {analysisData?.healingText ?? "Healing appears slightly slower than expected. The current visual stage looks somewhat earlier than the expected Yellow stage for the reported timing."}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="analysis-pair">
                  <div className="analysis-white-card quant-card">
                    <h3 className="quant-title">Quantitative summary</h3>
                    <div className="quant-table">
                      <div className="quant-row">
                        <p className="quant-label">Red</p>
                        <div className="quant-bar"><div className="quant-fill" style={{ width: `${Math.max(8, Math.round((analysisData?.stageScores.red ?? 0) * 138))}px`, background: "#f41616" }} /></div>
                        <p className="quant-score">{analysisData ? formatScore(analysisData.stageScores.red) : "0.00 / 1.00"}</p>
                      </div>
                      <div className="quant-row">
                        <p className="quant-label">Blue</p>
                        <div className="quant-bar"><div className="quant-fill" style={{ width: `${Math.max(8, Math.round((analysisData?.stageScores.blue ?? 0) * 138))}px`, background: "#2450db" }} /></div>
                        <p className="quant-score">{analysisData ? formatScore(analysisData.stageScores.blue) : "0.00 / 1.00"}</p>
                      </div>
                      <div className="quant-row">
                        <p className="quant-label">Purple</p>
                        <div className="quant-bar"><div className="quant-fill" style={{ width: `${Math.max(8, Math.round((analysisData?.stageScores.purple ?? 0) * 138))}px`, background: "#8f17df" }} /></div>
                        <p className="quant-score">{analysisData ? formatScore(analysisData.stageScores.purple) : "0.00 / 1.00"}</p>
                      </div>
                      <div className="quant-row">
                        <p className="quant-label">Brown</p>
                        <div className="quant-bar"><div className="quant-fill" style={{ width: `${Math.max(8, Math.round((analysisData?.stageScores.brown ?? 0) * 138))}px`, background: "#b26b3b" }} /></div>
                        <p className="quant-score">{analysisData ? formatScore(analysisData.stageScores.brown) : "0.00 / 1.00"}</p>
                      </div>
                      <div className="quant-row">
                        <p className="quant-label">Yellow</p>
                        <div className="quant-bar"><div className="quant-fill" style={{ width: `${Math.max(8, Math.round((analysisData?.stageScores.yellow ?? 0) * 138))}px`, background: "#f4bf3a" }} /></div>
                        <p className="quant-score">{analysisData ? formatScore(analysisData.stageScores.yellow) : "0.00 / 1.00"}</p>
                      </div>
                    </div>
                  </div>
                  <div className="analysis-blue-card">
                    <div className="analysis-blue-pad26">
                      <div className="analysis-blue-score-grid">
                        <div>
                          <p className="analysis-blue-score-label">Bruise intensity score</p>
                          <p className="analysis-blue-score-value">{analysisData ? formatScore(analysisData.intensityScore) : "0.74 / 1.00"}</p>
                          <p className="analysis-blue-score-meta">{analysisData?.intensityLabel ?? "Strong"}</p>
                        </div>
                        <div>
                          <p className="analysis-blue-score-label">Selection consistency score</p>
                          <p className="analysis-blue-score-value">{analysisData ? formatScore(analysisData.consistencyScore) : "0.36 / 1.00"}</p>
                          <p className="analysis-blue-score-meta">{analysisData?.consistencyLabel ?? "Low"}</p>
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
                        <div className="intensity-circle-item"><div className={`intensity-pill ${analysisData?.intensityLabel === "Moderate" ? "active" : ""}`}>Moderate</div></div>
                        <div className="intensity-circle-item"><div className={`intensity-pill ${analysisData?.intensityLabel === "Mild" ? "active" : ""}`}>Mild</div></div>
                        <div className="intensity-circle-item"><div className={`intensity-pill ${analysisData?.intensityLabel === "Strong" ? "active" : ""}`}>Strong</div></div>
                        <div className="intensity-circle-item"><div className={`intensity-pill ${analysisData?.intensityLabel === "Very Strong" ? "active" : ""}`}>Very Strong</div></div>
                      </div>
                    </div>
                  </div>
                  <div className="analysis-blue-card">
                    <div className="analysis-blue-pad26">
                      <p className="analysis-blue-text analysis-blue-center">
                        {analysisData?.intensitySummary ?? "The selected bruise core appears noticeably dark overall. The overall intensity is interpreted as Strong."}
                      </p>
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
                        <div className={`consistency-pill low ${analysisData?.consistencyLabel === "Low" ? "active" : ""}`}>Low</div>
                        <div className={`consistency-pill moderate ${analysisData?.consistencyLabel === "Moderate" ? "active" : ""}`}>Moderate</div>
                        <div className={`consistency-pill high ${analysisData?.consistencyLabel === "High" ? "active" : ""}`}>High</div>
                      </div>
                    </div>
                  </div>
                  <div className="analysis-blue-card">
                    <div className="analysis-blue-pad26">
                      <p className="analysis-blue-text analysis-blue-center">
                        {analysisData?.consistencySummary ?? "This reflects how similar your bruise boundary selections were across repeated passes. A low result suggests the selected boundary was harder to reproduce consistently."}
                      </p>
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

        {showEditLockedAlert ? (
          <div className="alert-overlay" onClick={() => setShowEditLockedAlert(false)}>
            <div className="alert-modal" onClick={(e) => e.stopPropagation()}>
              <p className="alert-message">Editing is locked after analysis. Upload a new photo or cancel a saved pass to start a new selection.</p>
              <div className="alert-actions">
                <button className="alert-secondary" onClick={() => { setShowEditLockedAlert(false); fileInputRef.current?.click(); }}>Upload New Photo</button>
                <button className="alert-ok" onClick={() => setShowEditLockedAlert(false)}>OK</button>
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
