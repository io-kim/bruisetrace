"use client";

import { useMemo, useRef, useState } from "react";

type ToolMode = "bruise" | "erase" | null;
type PassIndex = 0 | 1 | 2;
type SavedMask = Uint8ClampedArray | null;

type BruiseAgeKey =
  | "unknown"
  | "within24h"
  | "day1to2"
  | "day3to4"
  | "day5to7"
  | "day8to10"
  | "day11to13"
  | "day14plus";

type StageKey = "red" | "blue" | "purple" | "brown" | "yellow" | "resolved";
type ConsistencyLabel = "Low" | "Moderate" | "High";
type IntensityLabel = "Mild" | "Moderate" | "Strong" | "Very Strong";

type StageConfidenceItem = {
  key: StageKey;
  label: string;
  score: number;
};

type HealingStageUI = {
  slot: 1 | 2 | 3 | 4 | 5;
  shortLabel: "S1" | "S2" | "S3" | "S4" | "S5";
  title: string;
  description: string;
};

type AnalysisResult = {
  stageKey: StageKey;
  stageLabel: string;
  stageSummaryLines: string[];
  stageContextLine?: string;
  stageProgressPercent: number;
  stageConfidenceAll: StageConfidenceItem[];
  stageConfidenceTop: StageConfidenceItem[];
  consistencyLabel: ConsistencyLabel;
  consistencyMeaningLines: string[];
  consistencyScore: number;
  intensityLabel: IntensityLabel;
  intensityLines: string[];
  intensityScore: number;
  consensusPixels: number;
  refinedCount: number;
  avgR: number;
  avgG: number;
  avgB: number;
  coreAvgR: number;
  coreAvgG: number;
  coreAvgB: number;
};

const FRAME_SIZE = 560;
const PAN_PADDING = 80;

const DEFAULT_ZOOM = 1;
const BRUISE_BRUSH_MIN = 10;
const BRUISE_BRUSH_MAX = 70;
const ERASE_BRUSH_MIN = 10;
const ERASE_BRUSH_MAX = 70;
const DEFAULT_BRUISE_BRUSH = (BRUISE_BRUSH_MIN + BRUISE_BRUSH_MAX) / 2;
const DEFAULT_ERASE_BRUSH = (ERASE_BRUSH_MIN + ERASE_BRUSH_MAX) / 2;

const PASS_LABELS = ["Tight", "Balanced", "Broad"] as const;

const AGE_OPTIONS: { key: BruiseAgeKey; label: string }[] = [
  { key: "unknown", label: "Unknown" },
  { key: "within24h", label: "Within 24h" },
  { key: "day1to2", label: "1–2 days" },
  { key: "day3to4", label: "3–4 days" },
  { key: "day5to7", label: "5–7 days" },
  { key: "day8to10", label: "8–10 days" },
  { key: "day11to13", label: "11–13 days" },
  { key: "day14plus", label: "14+ days" },
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function formatScore(value: number) {
  return `${value.toFixed(2)} / 1.00`;
}

function stageDisplayLabel(key: StageKey) {
  return {
    red: "Red",
    blue: "Blue",
    purple: "Purple",
    brown: "Brown",
    yellow: "Yellow",
    resolved: "Resolved",
  }[key];
}

function stageColor(key: StageKey) {
  return {
    red: "#d74236",
    blue: "#2e59d9",
    purple: "#a041ea",
    brown: "#ac6838",
    yellow: "#e0a635",
    resolved: "#c9c9c9",
  }[key];
}

function rgbToHsv(r: number, g: number, b: number) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    switch (max) {
      case rn:
        h = ((gn - bn) / d) % 6;
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      case bn:
        h = (rn - gn) / d + 4;
        break;
    }
    h *= 60;
    if (h < 0) h += 360;
  }

  const s = max === 0 ? 0 : d / max;
  const v = max;

  return { h, s, v };
}

function softmaxStageScores(
  scores: Record<StageKey, number>,
  temperature = 0.78
): Record<StageKey, number> {
  const entries = Object.entries(scores) as Array<[StageKey, number]>;
  const maxScore = Math.max(...entries.map(([, score]) => score));
  const expValues = entries.map(([key, score]) => [
    key,
    Math.exp((score - maxScore) / temperature),
  ]) as Array<[StageKey, number]>;

  const total = expValues.reduce((sum, [, value]) => sum + value, 0) || 1;

  return Object.fromEntries(
    expValues.map(([key, value]) => [key, clamp(value / total, 0, 1)])
  ) as Record<StageKey, number>;
}

function getHealingStageUI(stageKey: StageKey): HealingStageUI {
  if (stageKey === "red") {
    return {
      slot: 1,
      shortLabel: "S1",
      title: "Early Red stage",
      description:
        "The current visual pattern is most consistent with the early red stage of bruise healing. Actual timing may vary depending on skin tone, lighting conditions, and bruise depth.",
    };
  }

  if (stageKey === "blue" || stageKey === "purple") {
    return {
      slot: 2,
      shortLabel: "S2",
      title: "Blue Purple stage",
      description:
        "The current visual pattern is most consistent with the blue purple stage of bruise healing. Actual timing may vary depending on skin tone, lighting conditions, and bruise depth.",
    };
  }

  if (stageKey === "brown") {
    return {
      slot: 3,
      shortLabel: "S3",
      title: "Brown Green transition stage",
      description:
        "The current visual pattern is most consistent with the brown green transition stage of bruise healing. Actual timing may vary depending on skin tone, lighting conditions, and bruise depth.",
    };
  }

  if (stageKey === "yellow") {
    return {
      slot: 4,
      shortLabel: "S4",
      title: "Yellow stage",
      description:
        "The current visual pattern is most consistent with the yellow stage of bruise healing. Actual timing may vary depending on skin tone, lighting conditions, and bruise depth.",
    };
  }

  return {
    slot: 5,
    shortLabel: "S5",
    title: "Resolved stage",
    description:
      "The visible bruise signal appears faint overall and is most consistent with a near-resolved stage. Actual timing may vary depending on skin tone, lighting conditions, and bruise depth.",
  };
}

export default function Home() {
  const [image, setImage] = useState<string | null>(null);
  const [imgNaturalSize, setImgNaturalSize] = useState({ width: 0, height: 0 });
  const [imgOffset, setImgOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);

  const [toolMode, setToolMode] = useState<ToolMode>(null);
  const [bruiseBrushSize, setBruiseBrushSize] = useState(DEFAULT_BRUISE_BRUSH);
  const [eraseBrushSize, setEraseBrushSize] = useState(DEFAULT_ERASE_BRUSH);

  const [draggingImage, setDraggingImage] = useState(false);
  const [painting, setPainting] = useState(false);
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number } | null>(null);

  const [bruiseAge, setBruiseAge] = useState<BruiseAgeKey>("unknown");

  const [analysisText, setAnalysisText] = useState(
    "Upload a photo, then complete guided selections from Tight to Broad for a more stable interpretation."
  );

  const [currentPass, setCurrentPass] = useState<PassIndex>(0);
  const [savedSelections, setSavedSelections] = useState<[SavedMask, SavedMask, SavedMask]>([
    null,
    null,
    null,
  ]);
  const [refinedSelections, setRefinedSelections] = useState<[SavedMask, SavedMask, SavedMask]>([
    null,
    null,
    null,
  ]);
  const [sameAsPrevious, setSameAsPrevious] = useState<[boolean, boolean, boolean]>([
    false,
    false,
    false,
  ]);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const dragStartRef = useRef({ x: 0, y: 0 });
  const offsetStartRef = useRef({ x: 0, y: 0 });
  const currentObjectUrlRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const roiCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  function getDisplayedSize(currentZoom: number, natural = imgNaturalSize) {
    if (!natural.width || !natural.height) {
      return { width: FRAME_SIZE * currentZoom, height: FRAME_SIZE * currentZoom };
    }

    const scaleToCover = Math.max(FRAME_SIZE / natural.width, FRAME_SIZE / natural.height);

    return {
      width: natural.width * scaleToCover * currentZoom,
      height: natural.height * scaleToCover * currentZoom,
    };
  }

  function clampOffset(
    nextX: number,
    nextY: number,
    currentZoom: number,
    natural = imgNaturalSize
  ) {
    const displayed = getDisplayedSize(currentZoom, natural);

    const minX = FRAME_SIZE - displayed.width - PAN_PADDING;
    const maxX = PAN_PADDING;
    const minY = FRAME_SIZE - displayed.height - PAN_PADDING;
    const maxY = PAN_PADDING;

    return {
      x: Math.max(minX, Math.min(maxX, nextX)),
      y: Math.max(minY, Math.min(maxY, nextY)),
    };
  }

  function centerImage(currentZoom: number, natural = imgNaturalSize) {
    const displayed = getDisplayedSize(currentZoom, natural);

    return clampOffset(
      (FRAME_SIZE - displayed.width) / 2,
      (FRAME_SIZE - displayed.height) / 2,
      currentZoom,
      natural
    );
  }

  function getZoomOffsetKeepingFrameCenter(
    prevZoom: number,
    nextZoom: number,
    currentOffset: { x: number; y: number },
    natural = imgNaturalSize
  ) {
    const prevSize = getDisplayedSize(prevZoom, natural);
    const nextSize = getDisplayedSize(nextZoom, natural);

    const frameCenterX = FRAME_SIZE / 2;
    const frameCenterY = FRAME_SIZE / 2;

    const imagePointX = (frameCenterX - currentOffset.x) / prevSize.width;
    const imagePointY = (frameCenterY - currentOffset.y) / prevSize.height;

    const rawX = frameCenterX - imagePointX * nextSize.width;
    const rawY = frameCenterY - imagePointY * nextSize.height;

    return clampOffset(rawX, rawY, nextZoom, natural);
  }

  function clearMaskCanvasOnly() {
    const mask = maskCanvasRef.current;
    if (!mask) return;
    const ctx = mask.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, FRAME_SIZE, FRAME_SIZE);
  }

  function clearOverlayCanvasOnly() {
    const overlay = overlayCanvasRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, FRAME_SIZE, FRAME_SIZE);
  }

  function hardResetOverlay() {
    clearMaskCanvasOnly();
    clearOverlayCanvasOnly();
  }

  function clearMask() {
    hardResetOverlay();
    redrawOverlay();
  }

  function currentBrushSize() {
    return toolMode === "erase" ? eraseBrushSize : bruiseBrushSize;
  }

  function drawBrush(x: number, y: number) {
    const mask = maskCanvasRef.current;
    if (!mask) return;
    const ctx = mask.getContext("2d");
    if (!ctx) return;

    const radius = currentBrushSize() / 2;

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);

    if (toolMode === "bruise") {
      ctx.fillStyle = "rgba(255,255,255,1)";
      ctx.fill();
    } else if (toolMode === "erase") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    }

    ctx.restore();
    redrawOverlay();
  }

  function drawCurrentViewToCanvas() {
    const img = imgRef.current;
    const roiCanvas = roiCanvasRef.current;
    if (!img || !roiCanvas) return null;

    const ctx = roiCanvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;

    const displayed = getDisplayedSize(zoom);

    roiCanvas.width = FRAME_SIZE;
    roiCanvas.height = FRAME_SIZE;
    ctx.clearRect(0, 0, FRAME_SIZE, FRAME_SIZE);
    ctx.drawImage(img, imgOffset.x, imgOffset.y, displayed.width, displayed.height);

    return ctx;
  }

  function getMaskFromCanvas() {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return null;
    const maskCtx = maskCanvas.getContext("2d", { willReadFrequently: true });
    if (!maskCtx) return null;
    const maskData = maskCtx.getImageData(0, 0, FRAME_SIZE, FRAME_SIZE).data;
    const out = new Uint8ClampedArray(FRAME_SIZE * FRAME_SIZE);

    for (let i = 0; i < FRAME_SIZE * FRAME_SIZE; i++) {
      out[i] = maskData[i * 4 + 3] > 10 ? 1 : 0;
    }

    return out;
  }

  function loadMaskToCanvas(mask: Uint8ClampedArray | null) {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;
    const maskCtx = maskCanvas.getContext("2d");
    if (!maskCtx) return;

    maskCtx.clearRect(0, 0, FRAME_SIZE, FRAME_SIZE);

    if (mask) {
      const imageData = maskCtx.createImageData(FRAME_SIZE, FRAME_SIZE);
      for (let i = 0; i < FRAME_SIZE * FRAME_SIZE; i++) {
        if (mask[i]) {
          const p = i * 4;
          imageData.data[p] = 255;
          imageData.data[p + 1] = 255;
          imageData.data[p + 2] = 255;
          imageData.data[p + 3] = 255;
        }
      }
      maskCtx.putImageData(imageData, 0, 0);
    }

    redrawOverlay();
  }

  function getLuminance(r: number, g: number, b: number) {
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function countMaskPixels(mask: Uint8ClampedArray | null) {
    if (!mask) return 0;
    let count = 0;
    for (let i = 0; i < mask.length; i++) {
      if (mask[i]) count++;
    }
    return count;
  }

  function findConnectedComponents(
    candidateMask: Uint8ClampedArray,
    width: number,
    height: number
  ) {
    const visited = new Uint8Array(width * height);
    const components: number[][] = [];
    const dirs = [-1, 1, -width, width, -width - 1, -width + 1, width - 1, width + 1];

    for (let i = 0; i < candidateMask.length; i++) {
      if (!candidateMask[i] || visited[i]) continue;

      const queue = [i];
      const comp: number[] = [];
      visited[i] = 1;

      while (queue.length) {
        const current = queue.pop() as number;
        comp.push(current);

        const x = current % width;
        const y = Math.floor(current / width);

        for (const d of dirs) {
          const ni = current + d;
          if (ni < 0 || ni >= candidateMask.length) continue;

          const nx = ni % width;
          const ny = Math.floor(ni / width);
          if (Math.abs(nx - x) > 1 || Math.abs(ny - y) > 1) continue;
          if (!candidateMask[ni] || visited[ni]) continue;

          visited[ni] = 1;
          queue.push(ni);
        }
      }

      components.push(comp);
    }

    return components.sort((a, b) => b.length - a.length);
  }

  function refineSelection(
    rawMask: Uint8ClampedArray,
    rgbaData: Uint8ClampedArray,
    width: number,
    height: number
  ) {
    const rawCount = countMaskPixels(rawMask);
    if (rawCount < 20) return rawMask;

    let lumSum = 0;
    let selectedCount = 0;
    const luminances = new Float32Array(width * height);

    for (let i = 0; i < rawMask.length; i++) {
      if (!rawMask[i]) continue;
      const p = i * 4;
      const lum = getLuminance(rgbaData[p], rgbaData[p + 1], rgbaData[p + 2]);
      luminances[i] = lum;
      lumSum += lum;
      selectedCount++;
    }

    if (!selectedCount) return rawMask;

    const meanLum = lumSum / selectedCount;
    const threshold = meanLum - 12;
    const candidateMask = new Uint8ClampedArray(width * height);

    for (let i = 0; i < rawMask.length; i++) {
      if (!rawMask[i]) continue;
      if (luminances[i] < threshold) candidateMask[i] = 1;
    }

    let components = findConnectedComponents(candidateMask, width, height);
    const minClusterSize = Math.max(18, Math.floor(rawCount * 0.015));
    components = components.filter((comp) => comp.length >= minClusterSize);

    if (components.length > 0) {
      const refined = new Uint8ClampedArray(width * height);
      for (const idx of components[0]) refined[idx] = 1;
      return refined;
    }

    const rawPixels: Array<{ idx: number; lum: number }> = [];
    for (let i = 0; i < rawMask.length; i++) {
      if (!rawMask[i]) continue;
      rawPixels.push({ idx: i, lum: luminances[i] });
    }

    rawPixels.sort((a, b) => a.lum - b.lum);
    const keepCount = Math.max(20, Math.floor(rawPixels.length * 0.22));
    const fallback = new Uint8ClampedArray(width * height);

    for (let i = 0; i < keepCount && i < rawPixels.length; i++) {
      fallback[rawPixels[i].idx] = 1;
    }

    return fallback;
  }

  function buildConsensusMask(refinedMasks: SavedMask[]) {
    const countMap = new Uint8ClampedArray(FRAME_SIZE * FRAME_SIZE);
    let available = 0;

    for (const mask of refinedMasks) {
      if (!mask) continue;
      available++;
      for (let i = 0; i < mask.length; i++) {
        if (mask[i]) countMap[i] += 1;
      }
    }

    if (!available) {
      return { consensus: null as Uint8ClampedArray | null, countMap };
    }

    const consensus = new Uint8ClampedArray(FRAME_SIZE * FRAME_SIZE);
    let strongCount = 0;

    for (let i = 0; i < countMap.length; i++) {
      if (countMap[i] >= 2) {
        consensus[i] = 1;
        strongCount++;
      }
    }

    if (strongCount < 30) {
      for (let i = 0; i < countMap.length; i++) {
        consensus[i] = countMap[i] >= 1 ? 1 : 0;
      }
    }

    return { consensus, countMap };
  }

  function computeSelectionConsistency(refinedMasks: SavedMask[]) {
    const validMasks = refinedMasks.filter(Boolean) as Uint8ClampedArray[];
    if (validMasks.length === 0) return 0;

    let intersection = 0;
    let union = 0;

    for (let i = 0; i < FRAME_SIZE * FRAME_SIZE; i++) {
      let count = 0;
      for (const mask of validMasks) {
        if (mask[i]) count++;
      }
      if (count > 0) union++;
      if (count === validMasks.length) intersection++;
    }

    if (union === 0) return 0;
    return intersection / union;
  }

  function getConsistencyLabel(value: number): ConsistencyLabel {
    if (value >= 0.75) return "High";
    if (value >= 0.45) return "Moderate";
    return "Low";
  }

  function redrawOverlay() {
    const mask = maskCanvasRef.current;
    const overlay = overlayCanvasRef.current;
    if (!mask || !overlay) return;

    const maskCtx = mask.getContext("2d", { willReadFrequently: true });
    const overlayCtx = overlay.getContext("2d");
    if (!maskCtx || !overlayCtx) return;

    const maskImg = maskCtx.getImageData(0, 0, FRAME_SIZE, FRAME_SIZE).data;
    overlayCtx.clearRect(0, 0, FRAME_SIZE, FRAME_SIZE);

    for (let y = 0; y < FRAME_SIZE; y += 2) {
      for (let x = 0; x < FRAME_SIZE; x += 2) {
        const i = (y * FRAME_SIZE + x) * 4;
        if (maskImg[i + 3] >= 10) {
          overlayCtx.fillStyle = "rgba(101, 79, 206, 0.16)";
          overlayCtx.fillRect(x, y, 2, 2);

          if (x % 6 === 0 && y % 6 === 0) {
            overlayCtx.fillStyle = "rgba(124, 95, 218, 0.34)";
            overlayCtx.beginPath();
            overlayCtx.arc(x + 1, y + 1, 0.7, 0, Math.PI * 2);
            overlayCtx.fill();
          }
        }
      }
    }
  }

  function startMove(clientX: number, clientY: number) {
    if (!image) return;
    setDraggingImage(true);
    dragStartRef.current = { x: clientX, y: clientY };
    offsetStartRef.current = { ...imgOffset };
  }

  function moveImage(clientX: number, clientY: number) {
    if (!draggingImage) return;

    const dx = clientX - dragStartRef.current.x;
    const dy = clientY - dragStartRef.current.y;

    const rawX = offsetStartRef.current.x + dx;
    const rawY = offsetStartRef.current.y + dy;

    setImgOffset(clampOffset(rawX, rawY, zoom));
  }

  function endMove() {
    setDraggingImage(false);
  }

  function clearPass(passIdx: PassIndex) {
    const nextSaved = [...savedSelections] as [SavedMask, SavedMask, SavedMask];
    const nextRefined = [...refinedSelections] as [SavedMask, SavedMask, SavedMask];
    const nextSame = [...sameAsPrevious] as [boolean, boolean, boolean];

    nextSaved[passIdx] = null;
    nextRefined[passIdx] = null;
    nextSame[passIdx] = false;

    setSavedSelections(nextSaved);
    setRefinedSelections(nextRefined);
    setSameAsPrevious(nextSame);
    setResult(null);
    setCurrentPass(passIdx);
    clearMask();
    setAnalysisText(`Pass ${passIdx + 1} (${PASS_LABELS[passIdx]}) was cleared.`);
  }

  function savePass(passIdx: PassIndex) {
    if (!image) return;

    const roiCtx = drawCurrentViewToCanvas();
    if (!roiCtx) return;

    const roiData = roiCtx.getImageData(0, 0, FRAME_SIZE, FRAME_SIZE).data;

    let rawMask: Uint8ClampedArray | null = null;

    if (passIdx > 0 && sameAsPrevious[passIdx]) {
      const prev = savedSelections[passIdx - 1];
      if (!prev) {
        setAnalysisText("Previous selection is not available yet.");
        return;
      }
      rawMask = prev.slice();
    } else {
      rawMask = getMaskFromCanvas();
      if (!rawMask || countMaskPixels(rawMask) < 20) {
        setAnalysisText("Brush more of the bruise area before saving this pass.");
        return;
      }
    }

    const refined = refineSelection(rawMask, roiData, FRAME_SIZE, FRAME_SIZE);
    const nextSaved = [...savedSelections] as [SavedMask, SavedMask, SavedMask];
    const nextRefined = [...refinedSelections] as [SavedMask, SavedMask, SavedMask];

    nextSaved[passIdx] = rawMask;
    nextRefined[passIdx] = refined;

    setSavedSelections(nextSaved);
    setRefinedSelections(nextRefined);
    setResult(null);

    hardResetOverlay();

    if (passIdx < 2) {
      const nextPass = (passIdx + 1) as PassIndex;
      setCurrentPass(nextPass);
      redrawOverlay();
      setAnalysisText(
        `Pass ${passIdx + 1} saved. Continue with Pass ${nextPass + 1} (${PASS_LABELS[nextPass]}).`
      );
    } else {
      setCurrentPass(2);
      redrawOverlay();
      setAnalysisText("Pass 3 saved. All guided selections are ready.");
    }
  }

  function getAgeExpectedIndex(age: BruiseAgeKey) {
    switch (age) {
      case "within24h":
        return 0.2;
      case "day1to2":
        return 1.2;
      case "day3to4":
        return 2.0;
      case "day5to7":
        return 3.0;
      case "day8to10":
        return 4.0;
      case "day11to13":
        return 4.4;
      case "day14plus":
        return 5.0;
      default:
        return null;
    }
  }

  function analyzeConsensus() {
    const roiCtx = drawCurrentViewToCanvas();
    if (!roiCtx) return;

    const availableRefined = refinedSelections.filter(Boolean).length;
    if (availableRefined === 0) {
      setAnalysisText("Save at least one guided selection before analyzing.");
      return;
    }

    const roiData = roiCtx.getImageData(0, 0, FRAME_SIZE, FRAME_SIZE).data;
    const { consensus } = buildConsensusMask(refinedSelections);

    if (!consensus || countMaskPixels(consensus) < 20) {
      setAnalysisText(
        "Could not build a stable consensus area. Try brushing the bruise region more clearly."
      );
      return;
    }

    const consistencyValue = computeSelectionConsistency(refinedSelections);
    const consistencyLabel = getConsistencyLabel(consistencyValue);

    const allPixels: Array<{
      r: number;
      g: number;
      b: number;
      h: number;
      s: number;
      v: number;
      lum: number;
      idx: number;
    }> = [];

    let consensusPixels = 0;
    let roiSumR = 0;
    let roiSumG = 0;
    let roiSumB = 0;
    let roiSumS = 0;
    let roiSumV = 0;
    let roiLumSum = 0;

    for (let i = 0; i < consensus.length; i++) {
      if (!consensus[i]) continue;

      const p = i * 4;
      const r = roiData[p];
      const g = roiData[p + 1];
      const b = roiData[p + 2];
      const { h, s, v } = rgbToHsv(r, g, b);
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

      consensusPixels++;
      roiSumR += r;
      roiSumG += g;
      roiSumB += b;
      roiSumS += s;
      roiSumV += v;
      roiLumSum += lum;

      allPixels.push({ r, g, b, h, s, v, lum, idx: i });
    }

    if (consensusPixels < 20) {
      setAnalysisText("Consensus region is too small to interpret reliably.");
      return;
    }

    const roiMeanV = roiSumV / consensusPixels;
    const roiMeanLum = roiLumSum / consensusPixels;

    const isRedHue = (h: number) => h <= 18 || h >= 342;
    const isBlueHue = (h: number) => h >= 195 && h <= 245;
    const isPurpleHue = (h: number) => h > 245 && h <= 320;
    const isBrownHue = (h: number) => h > 18 && h <= 42;
    const isYellowHue = (h: number) => h > 42 && h <= 70;

    const bruiseLikePixels = allPixels.filter((px) => {
      const resolvedLike = px.s < 0.16 && px.v > Math.max(0.62, roiMeanV - 0.02);
      const strongChromatic =
        (isRedHue(px.h) ||
          isBlueHue(px.h) ||
          isPurpleHue(px.h) ||
          isBrownHue(px.h) ||
          isYellowHue(px.h)) &&
        px.s >= 0.09;
      const darkCool = px.h >= 215 && px.h <= 320 && px.v <= roiMeanV + 0.02;
      return resolvedLike || strongChromatic || darkCool;
    });

    const stagePixels =
      bruiseLikePixels.length >= Math.max(24, Math.floor(allPixels.length * 0.24))
        ? bruiseLikePixels
        : allPixels;

    let sumR = 0;
    let sumG = 0;
    let sumB = 0;

    for (const px of stagePixels) {
      sumR += px.r;
      sumG += px.g;
      sumB += px.b;
    }

    const avgR = Math.round(sumR / stagePixels.length);
    const avgG = Math.round(sumG / stagePixels.length);
    const avgB = Math.round(sumB / stagePixels.length);

    const sortedByLum = [...stagePixels].sort((a, b) => a.lum - b.lum);
    const coreCount = Math.max(24, Math.floor(sortedByLum.length * 0.35));
    const corePixels = sortedByLum.slice(0, coreCount);

    let coreR = 0;
    let coreG = 0;
    let coreB = 0;
    let coreLumSum = 0;
    let coreSSum = 0;

    for (const px of corePixels) {
      coreR += px.r;
      coreG += px.g;
      coreB += px.b;
      coreLumSum += px.lum;
      coreSSum += px.s;
    }

    const coreAvgR = Math.round(coreR / corePixels.length);
    const coreAvgG = Math.round(coreG / corePixels.length);
    const coreAvgB = Math.round(coreB / corePixels.length);
    const coreMeanLum = coreLumSum / corePixels.length;
    const coreMeanS = coreSSum / corePixels.length;

    let redWeight = 0;
    let blueWeight = 0;
    let purpleWeight = 0;
    let brownWeight = 0;
    let yellowWeight = 0;
    let resolvedWeight = 0;

    for (const px of stagePixels) {
      const redDom = (px.r - (px.g + px.b) / 2) / 255;
      const blueDom = (px.b - (px.r + px.g) / 2) / 255;
      const purpleDom = ((px.r + px.b) / 2 - px.g) / 255;
      const warmDom = ((px.r + px.g) / 2 - px.b) / 255;

      const resolvedLike = px.s < 0.16 && px.v > Math.max(0.62, roiMeanV - 0.02);
      if (resolvedLike) resolvedWeight += 0.9 + clamp(px.v - 0.58, 0, 0.4);

      if (isRedHue(px.h) && px.s >= 0.12) {
        redWeight +=
          0.58 + clamp(redDom * 1.8, 0, 0.8) + clamp((px.s - 0.14) * 1.25, 0, 0.55);
      }
      if (isBlueHue(px.h) && px.s >= 0.09) {
        blueWeight +=
          0.68 +
          clamp(blueDom * 2.0, 0, 0.85) +
          clamp((0.72 - px.v) * 0.9, 0, 0.35) +
          clamp((px.s - 0.1) * 1.1, 0, 0.45);
      }
      if (isPurpleHue(px.h) && px.s >= 0.1) {
        purpleWeight +=
          0.76 +
          clamp(purpleDom * 2.1, 0, 0.9) +
          clamp((0.7 - px.v) * 0.95, 0, 0.4) +
          clamp((px.s - 0.11) * 1.15, 0, 0.48);
      }
      if (
        isBrownHue(px.h) &&
        px.s >= 0.08 &&
        px.v <= 0.78 &&
        px.r >= px.g &&
        px.g >= px.b * 0.82
      ) {
        brownWeight +=
          0.72 +
          clamp(warmDom * 1.5, 0, 0.58) +
          clamp((0.76 - px.v) * 1.05, 0, 0.45);
      }
      if (isYellowHue(px.h) && px.s >= 0.1 && px.v >= 0.46) {
        yellowWeight +=
          0.7 +
          clamp(warmDom * 1.55, 0, 0.62) +
          clamp((px.v - 0.48) * 0.8, 0, 0.35);
      }

      if (px.h >= 250 && px.h <= 300 && px.s >= 0.16) purpleWeight += 0.16;
      if (px.h >= 25 && px.h <= 38 && px.v < 0.68) brownWeight += 0.12;
      if (px.h >= 48 && px.h <= 66 && px.v > 0.6) yellowWeight += 0.12;
    }

    const redRatio = redWeight / stagePixels.length;
    const blueRatio = blueWeight / stagePixels.length;
    const purpleRatio = purpleWeight / stagePixels.length;
    const brownRatio = brownWeight / stagePixels.length;
    const yellowRatio = yellowWeight / stagePixels.length;
    const resolvedRatio = resolvedWeight / stagePixels.length;

    const hsvAll = rgbToHsv(avgR, avgG, avgB);
    const hsvCore = rgbToHsv(coreAvgR, coreAvgG, coreAvgB);

    const redDominance = (avgR - (avgG + avgB) / 2) / 255;
    const blueDominance = (avgB - (avgR + avgG) / 2) / 255;
    const purpleDominance = ((avgR + avgB) / 2 - avgG) / 255;
    const warmDominance = ((avgR + avgG) / 2 - avgB) / 255;

    const coreRedDominance = (coreAvgR - (coreAvgG + coreAvgB) / 2) / 255;
    const coreBlueDominance = (coreAvgB - (coreAvgR + coreAvgG) / 2) / 255;
    const corePurpleDominance = ((coreAvgR + coreAvgB) / 2 - coreAvgG) / 255;
    const coreWarmDominance = ((coreAvgR + coreAvgG) / 2 - coreAvgB) / 255;

    const stageScoresRaw: Record<StageKey, number> = {
      red:
        redRatio * 1.35 +
        clamp(redDominance, 0, 0.4) * 1.15 +
        clamp(coreRedDominance, 0, 0.4) * 0.75 +
        clamp(hsvAll.s - 0.18, 0, 0.4) * 0.45,

      blue:
        blueRatio * 1.55 +
        clamp(blueDominance, 0, 0.42) * 1.2 +
        clamp(coreBlueDominance, 0, 0.42) * 0.82 +
        clamp((roiMeanLum - coreMeanLum) / 90, 0, 0.4) * 0.42,

      purple:
        purpleRatio * 1.75 +
        clamp(purpleDominance, 0, 0.45) * 1.25 +
        clamp(corePurpleDominance, 0, 0.45) * 0.88 +
        clamp((roiMeanLum - coreMeanLum) / 85, 0, 0.42) * 0.45,

      brown:
        brownRatio * 1.55 +
        clamp(warmDominance, 0, 0.35) * 0.75 +
        clamp(coreWarmDominance, 0, 0.35) * 0.55 +
        clamp(0.74 - hsvAll.v, 0, 0.34) * 0.8,

      yellow:
        yellowRatio * 1.5 +
        clamp(warmDominance, 0, 0.35) * 0.62 +
        clamp(coreWarmDominance, 0, 0.35) * 0.42 +
        clamp(hsvAll.v - 0.54, 0, 0.34) * 0.78,

      resolved:
        resolvedRatio * 1.85 +
        clamp(0.2 - hsvAll.s, 0, 0.2) * 2.1 +
        clamp(hsvAll.v - 0.64, 0, 0.26) * 1.15 +
        clamp(0.18 - coreMeanS, 0, 0.18) * 1.3,
    };

    if (isRedHue(hsvCore.h) && hsvCore.s >= 0.16) stageScoresRaw.red += 0.16;
    if (isBlueHue(hsvCore.h) && hsvCore.s >= 0.1) stageScoresRaw.blue += 0.22;
    if (isPurpleHue(hsvCore.h) && hsvCore.s >= 0.12) stageScoresRaw.purple += 0.28;
    if (isBrownHue(hsvCore.h) && hsvCore.v <= 0.72) stageScoresRaw.brown += 0.22;
    if (isYellowHue(hsvAll.h) && hsvAll.v >= 0.56) stageScoresRaw.yellow += 0.18;
    if (hsvAll.s < 0.13 && hsvAll.v > 0.68) stageScoresRaw.resolved += 0.34;

    stageScoresRaw.purple += Math.min(redRatio, blueRatio) * 0.35;
    stageScoresRaw.brown += Math.min(purpleRatio, yellowRatio) * 0.14;

    stageScoresRaw.red -=
      purpleRatio * 0.55 + blueRatio * 0.34 + brownRatio * 0.16 + yellowRatio * 0.14;
    stageScoresRaw.blue -= redRatio * 0.16 + yellowRatio * 0.14;
    stageScoresRaw.purple -= yellowRatio * 0.08;
    stageScoresRaw.brown -= redRatio * 0.22 + blueRatio * 0.13;
    stageScoresRaw.yellow -=
      blueRatio * 0.12 + purpleRatio * 0.12 + clamp(0.52 - hsvAll.v, 0, 0.2) * 0.8;
    stageScoresRaw.resolved -=
      Math.max(redRatio, blueRatio, purpleRatio, brownRatio, yellowRatio) > 0.22 ? 0.28 : 0;

    if (redDominance < 0.035) stageScoresRaw.red -= 0.22;
    if (hsvAll.s < 0.16) stageScoresRaw.red -= 0.18;

    const stageScoresSmoothed: Record<StageKey, number> = {
      red: stageScoresRaw.red * 0.84 + stageScoresRaw.blue * 0.16,
      blue:
        stageScoresRaw.blue * 0.72 + stageScoresRaw.red * 0.12 + stageScoresRaw.purple * 0.16,
      purple:
        stageScoresRaw.purple * 0.68 +
        stageScoresRaw.blue * 0.15 +
        stageScoresRaw.brown * 0.17,
      brown:
        stageScoresRaw.brown * 0.72 +
        stageScoresRaw.purple * 0.15 +
        stageScoresRaw.yellow * 0.13,
      yellow:
        stageScoresRaw.yellow * 0.78 +
        stageScoresRaw.brown * 0.14 +
        stageScoresRaw.resolved * 0.08,
      resolved: stageScoresRaw.resolved * 0.86 + stageScoresRaw.yellow * 0.14,
    };

    const stageScores: Record<StageKey, number> = {
      red: Math.max(0.01, stageScoresSmoothed.red),
      blue: Math.max(0.01, stageScoresSmoothed.blue),
      purple: Math.max(0.01, stageScoresSmoothed.purple),
      brown: Math.max(0.01, stageScoresSmoothed.brown),
      yellow: Math.max(0.01, stageScoresSmoothed.yellow),
      resolved: Math.max(0.01, stageScoresSmoothed.resolved),
    };

    const normalizedScoreMap = softmaxStageScores(stageScores, 0.78);
    const orderedKeys: StageKey[] = ["red", "blue", "purple", "brown", "yellow"];

    const stageConfidenceAll = orderedKeys.map((key) => ({
      key,
      label: stageDisplayLabel(key),
      score: normalizedScoreMap[key],
    }));

    const stageConfidenceTop = [...stageConfidenceAll]
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    const sortedProb = [...stageConfidenceAll].sort((a, b) => b.score - a.score);
    const bestStage = sortedProb[0].key;
    const bestProb = sortedProb[0]?.score ?? 0;
    const secondProb = sortedProb[1]?.score ?? 0;

    const stageKey: StageKey = bestStage;

    let stageSummaryLines = [
      "This bruise pattern most strongly reflects a red-dominant stage.",
      "The visible hue distribution is currently interpreted closest to Red.",
    ];

    if (bestStage === "blue") {
      stageSummaryLines = [
        "This bruise pattern most strongly reflects a blue-dominant stage.",
        "The visible hue distribution is currently interpreted closest to Blue.",
      ];
    } else if (bestStage === "purple") {
      stageSummaryLines = [
        "This bruise pattern most strongly reflects a purple-dominant stage.",
        "The visible hue distribution is currently interpreted closest to Purple.",
      ];
    } else if (bestStage === "brown") {
      stageSummaryLines = [
        "This bruise pattern most strongly reflects a brown-dominant stage.",
        "The visible hue distribution is currently interpreted closest to Brown.",
      ];
    } else if (bestStage === "yellow") {
      stageSummaryLines = [
        "This bruise pattern most strongly reflects a yellow-dominant stage.",
        "The visible hue distribution is currently interpreted closest to Yellow.",
      ];
    } else if (bestStage === "resolved") {
      stageSummaryLines = [
        "The visible bruise signal appears relatively faint or near-resolved.",
        "The visible hue distribution is currently interpreted closest to Resolved.",
      ];
    }

    let stageContextLine: string | undefined;
    const stageOrder: Record<StageKey, number> = {
      red: 0,
      blue: 1,
      purple: 2,
      brown: 3,
      yellow: 4,
      resolved: 5,
    };

    const expectedIdx = getAgeExpectedIndex(bruiseAge);
    if (expectedIdx !== null) {
      const diff = stageOrder[bestStage] - expectedIdx;

      if (diff <= -2) {
        stageContextLine =
          "Compared with the reported timing, the visible bruise signal looks clearly earlier than expected.";
      } else if (diff < -0.9) {
        stageContextLine =
          "Compared with the reported timing, the visible bruise signal looks slightly earlier than expected.";
      } else if (diff >= 2) {
        stageContextLine =
          "Compared with the reported timing, the visible bruise signal looks clearly later in healing than expected.";
      } else if (diff > 0.9) {
        stageContextLine =
          "Compared with the reported timing, the visible bruise signal looks slightly later in healing than expected.";
      } else {
        stageContextLine =
          "Compared with the reported timing, the current color stage looks broadly in range.";
      }
    }

    let consistencyMeaningLines = [
      "This reflects how similar your bruise boundary selections were across repeated passes.",
      "Higher consistency usually means the bruise boundary was easier to identify.",
    ];

    if (consistencyLabel === "Moderate") {
      consistencyMeaningLines = [
        "This reflects how similar your bruise boundary selections were across repeated passes.",
        "A moderate result suggests the bruise boundary was visible, but not perfectly defined.",
      ];
    } else if (consistencyLabel === "Low") {
      consistencyMeaningLines = [
        "This reflects how similar your bruise boundary selections were across repeated passes.",
        "A low result usually means the bruise boundary was harder to define consistently.",
      ];
    }

    const darknessScore = clamp((150 - coreMeanLum) / 90, 0, 1);
    const intensityScore = darknessScore;

    let intensityLabel: IntensityLabel = "Mild";
    let intensityLines = [
      "The bruise core appears relatively light compared with surrounding skin.",
      "The overall intensity is interpreted as Mild.",
    ];

    if (darknessScore >= 0.78) {
      intensityLabel = "Very Strong";
      intensityLines = [
        "The bruise core appears very dark compared with surrounding skin.",
        "The overall intensity is interpreted as Very Strong.",
      ];
    } else if (darknessScore >= 0.58) {
      intensityLabel = "Strong";
      intensityLines = [
        "The bruise core appears noticeably dark compared with surrounding skin.",
        "The overall intensity is interpreted as Strong.",
      ];
    } else if (darknessScore >= 0.38) {
      intensityLabel = "Moderate";
      intensityLines = [
        "The bruise core appears moderately darker than surrounding skin.",
        "The overall intensity is interpreted as Moderate.",
      ];
    }

    const stageOrderIndex = stageOrder[bestStage];
    const confidenceGap = clamp(bestProb - secondProb, 0, 1);
    const withinStage = clamp(0.48 + confidenceGap * 0.34, 0.44, 0.88);
    const stageProgressPercent = clamp(((stageOrderIndex + withinStage) / 6) * 100, 6, 100);

    setResult({
      stageKey,
      stageLabel: stageDisplayLabel(stageKey),
      stageSummaryLines,
      stageContextLine,
      stageProgressPercent,
      stageConfidenceAll,
      stageConfidenceTop,
      consistencyLabel,
      consistencyMeaningLines,
      consistencyScore: clamp(consistencyValue, 0, 1),
      intensityLabel,
      intensityLines,
      intensityScore,
      consensusPixels,
      refinedCount: availableRefined,
      avgR,
      avgG,
      avgB,
      coreAvgR,
      coreAvgG,
      coreAvgB,
    });

    setAnalysisText(
      "Consensus analysis complete. The final interpretation used weighted bruise-like hue signals within the refined overlap region."
    );

    hardResetOverlay();
  }

  function handleUpload(file: File) {
    const newUrl = URL.createObjectURL(file);
    const tempImg = new Image();

    tempImg.onload = () => {
      const natural = {
        width: tempImg.naturalWidth,
        height: tempImg.naturalHeight,
      };

      if (currentObjectUrlRef.current) {
        URL.revokeObjectURL(currentObjectUrlRef.current);
      }
      currentObjectUrlRef.current = newUrl;

      setImage(newUrl);
      setImgNaturalSize(natural);

      const initialZoom = DEFAULT_ZOOM;
      setZoom(initialZoom);
      setImgOffset(centerImage(initialZoom, natural));
      setToolMode(null);
      setHoverPoint(null);
      setBruiseBrushSize(DEFAULT_BRUISE_BRUSH);
      setEraseBrushSize(DEFAULT_ERASE_BRUSH);
      setSavedSelections([null, null, null]);
      setRefinedSelections([null, null, null]);
      setSameAsPrevious([false, false, false]);
      setCurrentPass(0);
      setResult(null);
      setBruiseAge("unknown");
      setAnalysisText(
        "Photo loaded. Start with Pass 1 (Tight), then continue to Balanced and Broad."
      );

      hardResetOverlay();
      redrawOverlay();

      if (fileInputRef.current) fileInputRef.current.value = "";
    };

    tempImg.onerror = () => {
      URL.revokeObjectURL(newUrl);
      setAnalysisText("Could not load that image. Try a different file.");
    };

    tempImg.src = newUrl;
  }

  function intensityIndex(label: IntensityLabel) {
    return {
      Mild: 0,
      Moderate: 1,
      Strong: 2,
      "Very Strong": 3,
    }[label];
  }

  function consistencyIndex(label: ConsistencyLabel) {
    return {
      Low: 0,
      Moderate: 1,
      High: 2,
    }[label];
  }

  const displayed = getDisplayedSize(zoom);
  const bruiseActive = toolMode === "bruise";
  const eraseActive = toolMode === "erase";
  const savedAny = savedSelections.some(Boolean);
  const canAnalyze = image && refinedSelections.some(Boolean);
  const analyzeEnabledVisual = image && savedAny;

  const showBrushCursor =
    image && hoverPoint && (toolMode === "bruise" || toolMode === "erase");
  const previewRadius = currentBrushSize();

  const savedCounts = useMemo(
    () => savedSelections.map((m) => (m ? countMaskPixels(m) : 0)),
    [savedSelections]
  );

  const healingStage = result ? getHealingStageUI(result.stageKey) : null;

  const summaryBars =
    result?.stageConfidenceAll ?? [
      { key: "red" as StageKey, label: "Red", score: 0 },
      { key: "blue" as StageKey, label: "Blue", score: 0 },
      { key: "purple" as StageKey, label: "Purple", score: 0 },
      { key: "brown" as StageKey, label: "Brown", score: 0 },
      { key: "yellow" as StageKey, label: "Yellow", score: 0 },
    ];

  return (
    <>
      <style jsx global>{`
        html,
        body {
          margin: 0;
          padding: 0;
          background: #ffffff;
        }

        * {
          box-sizing: border-box;
        }

        input[type="range"] {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 4px;
          border-radius: 999px;
          background: #a7a7a7;
          outline: none;
        }

        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 13px;
          height: 13px;
          border-radius: 50%;
          background: #ffffff;
          border: 1.5px solid #8d8d8d;
          cursor: pointer;
        }

        input[type="range"]::-moz-range-thumb {
          width: 13px;
          height: 13px;
          border-radius: 50%;
          background: #ffffff;
          border: 1.5px solid #8d8d8d;
          cursor: pointer;
        }

        .page-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 26px;
          align-items: start;
        }

        .card {
          background: #ffffff;
          border: 1.6px solid #bebebe;
          border-radius: 4px;
          box-shadow: none;
        }

        .age-btn,
        .tool-btn,
        .choice-pill,
        .stage-pill,
        .save-btn,
        .analyze-btn {
          transition:
            background 0.18s ease,
            color 0.18s ease,
            border-color 0.18s ease,
            box-shadow 0.18s ease,
            transform 0.18s ease,
            opacity 0.18s ease;
        }

        .age-btn:hover,
        .tool-btn:hover,
        .choice-pill:hover,
        .save-btn:hover,
        .stage-pill:hover,
        .analyze-btn:hover:not(:disabled) {
          transform: translateY(-1px);
        }

        .age-btn:hover,
        .tool-btn:hover {
          box-shadow:
            0 0 0 3px rgba(66, 112, 255, 0.12),
            0 0 0 8px rgba(66, 112, 255, 0.05);
        }

        .tool-btn.is-active:hover {
          box-shadow:
            0 0 0 4px rgba(66, 112, 255, 0.16),
            0 0 0 10px rgba(66, 112, 255, 0.07);
        }

        .analyze-btn.is-enabled:hover {
          box-shadow:
            0 0 0 4px rgba(255, 73, 21, 0.14),
            0 0 0 10px rgba(255, 73, 21, 0.07);
        }

        button:focus,
        button:focus-visible {
          outline: none !important;
        }

        @media (max-width: 1280px) {
          .page-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 860px) {
          .age-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }

          .tool-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }

          .photo-pass-grid {
            grid-template-columns: 1fr !important;
          }

          .stage-pills-grid {
            grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
          }

          .confidence-row {
            grid-template-columns: 46px 1fr 88px !important;
          }

          .intensity-grid,
          .consistency-grid {
            gap: 10px !important;
          }

          .top-header-grid {
            grid-template-columns: 1fr !important;
            row-gap: 6px;
            height: auto !important;
            padding-top: 10px !important;
            padding-bottom: 10px !important;
          }

          .top-header-left,
          .top-header-center,
          .top-header-right {
            justify-self: start !important;
          }
        }
      `}</style>

      <>
        <header
          style={{
            background: "#ffffff",
            borderBottom: "1px solid #e5e5e5",
          }}
        >
          <div
            className="top-header-grid"
            style={{
              maxWidth: 1640,
              margin: "0 auto",
              padding: "0 18px",
              height: 58,
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              alignItems: "center",
              columnGap: 26,
            }}
          >
            <div
              className="top-header-left"
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 8,
                justifySelf: "start",
                minWidth: 0,
              }}
            >
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 700,
                  color: "#1c1c1c",
                  lineHeight: 1,
                  whiteSpace: "nowrap",
                }}
              >
                BruiseTrace
              </div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: "#2da1ff",
                  lineHeight: 1.2,
                  whiteSpace: "nowrap",
                }}
              >
                Inclusive skin signal measurement system
              </div>
            </div>

            <div
              className="top-header-center"
              style={{
                justifySelf: "start",
                fontSize: 28,
                fontWeight: 700,
                color: "#1c1c1c",
                lineHeight: 1,
                whiteSpace: "nowrap",
              }}
            >
              Analysis
            </div>

            <div
              className="top-header-right"
              style={{
                justifySelf: "end",
                display: "flex",
                alignItems: "center",
                gap: 10,
                color: "#1c1c1c",
                whiteSpace: "nowrap",
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  lineHeight: 1,
                }}
              >
                Io Kim
              </div>

              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: "#eadcfa",
                  border: "1.4px solid #ceb8ef",
                  position: "relative",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: "40%",
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "#8869c9",
                    transform: "translate(-50%, -50%)",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: "50%",
                    bottom: 2,
                    width: 12,
                    height: 6,
                    borderRadius: "8px 8px 0 0",
                    background: "#8869c9",
                    transform: "translateX(-50%)",
                  }}
                />
              </div>
            </div>
          </div>
        </header>

        <main
          style={{
            padding: 22,
            fontFamily:
              'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif',
            maxWidth: 1640,
            margin: "0 auto",
            color: "#1c1c1c",
          }}
        >
          <div className="page-grid">
            {/* LEFT COLUMN */}
            <section style={{ display: "grid", gap: 26 }}>
              <div className="card" style={{ padding: "16px 30px" }}>
                <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>
                  Estimated bruise age
                </div>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: "#595959",
                    marginBottom: 4,
                  }}
                >
                  When did the bruise likely begin?
                </div>
                <div
                  style={{
                    fontSize: 14,
                    color: "#777777",
                    marginBottom: 18,
                  }}
                >
                  Helps interpret bruise color stages.
                </div>

                <div
                  className="age-grid"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                    gap: 10,
                  }}
                >
                  {AGE_OPTIONS.map((item) => {
                    const active = bruiseAge === item.key;
                    return (
                      <button
                        key={item.key}
                        className="age-btn"
                        onClick={() => setBruiseAge(item.key)}
                        style={{
                          width: "100%",
                          minHeight: 38,
                          padding: "8px 8px",
                          borderRadius: 14,
                          border: `2px solid ${active ? "#3563f0" : "#6f93ff"}`,
                          background: active ? "#3563f0" : "#ffffff",
                          color: active ? "#ffffff" : "#244f9e",
                          fontWeight: 700,
                          fontSize: 13,
                          cursor: "pointer",
                          lineHeight: 1.1,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          textAlign: "center",
                        }}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="card" style={{ padding: "16px 30px" }}>
                <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>
                  Guided selection flow
                </div>
                <div
                  style={{
                    fontSize: 14,
                    color: "#6d6d6d",
                    lineHeight: 1.45,
                    marginBottom: 16,
                  }}
                >
                  To reduce boundary-selection error, make up to 3 guided selections:
                  <br />
                  <strong style={{ color: "#383838" }}>Tight, Balanced, and Broad.</strong>
                </div>

                <div
                  className="tool-grid"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                    gap: 10,
                    alignItems: "start",
                  }}
                >
                  <div>
                    <button
                      className="tool-btn is-active"
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        width: "100%",
                        height: 38,
                        borderRadius: 16,
                        border: "2px solid #3563f0",
                        background: "#3563f0",
                        color: "#ffffff",
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: "pointer",
                      }}
                    >
                      Upload Photo
                    </button>
                    <div style={{ marginTop: 8, padding: "0 14px" }}>
                      <input
                        type="range"
                        min="1"
                        max="2.5"
                        step="0.01"
                        value={zoom}
                        onChange={(e) => {
                          const nextZoom = Number(e.target.value);
                          setImgOffset((prev) =>
                            getZoomOffsetKeepingFrameCenter(zoom, nextZoom, prev)
                          );
                          setZoom(nextZoom);
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <button
                      className={`tool-btn ${bruiseActive ? "is-active" : ""}`}
                      onClick={() => setToolMode((prev) => (prev === "bruise" ? null : "bruise"))}
                      style={{
                        width: "100%",
                        height: 38,
                        borderRadius: 16,
                        border: "2px solid #6f93ff",
                        background: bruiseActive ? "#3563f0" : "#ffffff",
                        color: bruiseActive ? "#ffffff" : "#3563f0",
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: "pointer",
                      }}
                    >
                      Bruise Brush
                    </button>
                    <div style={{ marginTop: 8, padding: "0 14px" }}>
                      <input
                        type="range"
                        min={BRUISE_BRUSH_MIN}
                        max={BRUISE_BRUSH_MAX}
                        step="1"
                        value={bruiseBrushSize}
                        onChange={(e) => setBruiseBrushSize(Number(e.target.value))}
                        disabled={!bruiseActive}
                        style={{ opacity: bruiseActive ? 1 : 0.45 }}
                      />
                    </div>
                  </div>

                  <div>
                    <button
                      className={`tool-btn ${eraseActive ? "is-active" : ""}`}
                      onClick={() => setToolMode((prev) => (prev === "erase" ? null : "erase"))}
                      style={{
                        width: "100%",
                        height: 38,
                        borderRadius: 16,
                        border: "2px solid #6f93ff",
                        background: eraseActive ? "#3563f0" : "#ffffff",
                        color: eraseActive ? "#ffffff" : "#3563f0",
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: "pointer",
                      }}
                    >
                      Erase
                    </button>
                    <div style={{ marginTop: 8, padding: "0 14px" }}>
                      <input
                        type="range"
                        min={ERASE_BRUSH_MIN}
                        max={ERASE_BRUSH_MAX}
                        step="1"
                        value={eraseBrushSize}
                        onChange={(e) => setEraseBrushSize(Number(e.target.value))}
                        disabled={!eraseActive}
                        style={{ opacity: eraseActive ? 1 : 0.45 }}
                      />
                    </div>
                  </div>

                  <div>
                    <button
                      className={`analyze-btn ${analyzeEnabledVisual ? "is-enabled" : ""}`}
                      onClick={analyzeConsensus}
                      disabled={!canAnalyze}
                      style={{
                        width: "100%",
                        height: 38,
                        borderRadius: 16,
                        border: "2.2px solid #ff4b1f",
                        background: analyzeEnabledVisual ? "#ff4b1f" : "#ffffff",
                        color: analyzeEnabledVisual ? "#ffffff" : "#e23721",
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: canAnalyze ? "pointer" : "default",
                      }}
                    >
                      Analyze
                    </button>
                  </div>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    handleUpload(file);
                  }}
                />
              </div>

              <div
                className="photo-pass-grid"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.78fr 1fr",
                  gap: 16,
                  alignItems: "start",
                }}
              >
                <div
                  style={{
                    width: "100%",
                    aspectRatio: "1 / 1",
                    background: "#d3d3d3",
                    border: "1.6px solid #bdbdbd",
                    borderRadius: 4,
                    position: "relative",
                    overflow: "hidden",
                    userSelect: "none",
                    cursor: toolMode === null ? (draggingImage ? "grabbing" : "grab") : "default",
                  }}
                  onMouseDown={(e) => {
                    if (!image) return;

                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = ((e.clientX - rect.left) / rect.width) * FRAME_SIZE;
                    const y = ((e.clientY - rect.top) / rect.height) * FRAME_SIZE;

                    if (toolMode === null) {
                      startMove(e.clientX, e.clientY);
                    } else {
                      if (currentPass > 0 && sameAsPrevious[currentPass]) return;
                      setPainting(true);
                      drawBrush(x, y);
                    }
                  }}
                  onMouseMove={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = ((e.clientX - rect.left) / rect.width) * FRAME_SIZE;
                    const y = ((e.clientY - rect.top) / rect.height) * FRAME_SIZE;

                    setHoverPoint({
                      x: (x / FRAME_SIZE) * rect.width,
                      y: (y / FRAME_SIZE) * rect.height,
                    });

                    if (!image) return;

                    if (draggingImage && toolMode === null) {
                      moveImage(e.clientX, e.clientY);
                      return;
                    }

                    if (toolMode !== null && painting) {
                      if (currentPass > 0 && sameAsPrevious[currentPass]) return;
                      drawBrush(x, y);
                    }
                  }}
                  onMouseUp={() => {
                    setPainting(false);
                    endMove();
                  }}
                  onMouseLeave={() => {
                    setPainting(false);
                    endMove();
                    setHoverPoint(null);
                  }}
                >
                  {image ? (
                    <>
                      <img
                        ref={imgRef}
                        src={image}
                        alt="bruise upload"
                        draggable={false}
                        style={{
                          position: "absolute",
                          left: `${(imgOffset.x / FRAME_SIZE) * 100}%`,
                          top: `${(imgOffset.y / FRAME_SIZE) * 100}%`,
                          width: `${(displayed.width / FRAME_SIZE) * 100}%`,
                          height: `${(displayed.height / FRAME_SIZE) * 100}%`,
                          maxWidth: "none",
                          pointerEvents: "none",
                        }}
                      />

                      <canvas
                        ref={overlayCanvasRef}
                        width={FRAME_SIZE}
                        height={FRAME_SIZE}
                        style={{
                          position: "absolute",
                          inset: 0,
                          width: "100%",
                          height: "100%",
                          pointerEvents: "none",
                        }}
                      />

                      <canvas
                        ref={maskCanvasRef}
                        width={FRAME_SIZE}
                        height={FRAME_SIZE}
                        style={{ display: "none" }}
                      />

                      {showBrushCursor &&
                        !(currentPass > 0 && sameAsPrevious[currentPass]) && (
                          <div
                            style={{
                              position: "absolute",
                              left: hoverPoint.x,
                              top: hoverPoint.y,
                              width: `${(previewRadius / FRAME_SIZE) * 100}%`,
                              height: `${(previewRadius / FRAME_SIZE) * 100}%`,
                              transform: "translate(-50%, -50%)",
                              borderRadius: "50%",
                              border:
                                toolMode === "bruise"
                                  ? "2px solid #59ff6a"
                                  : "2px solid #4f4f4f",
                              background:
                                toolMode === "bruise"
                                  ? "rgba(89,255,106,0.08)"
                                  : "rgba(0,0,0,0.05)",
                              pointerEvents: "none",
                            }}
                          />
                        )}

                      <div
                        style={{
                          position: "absolute",
                          bottom: 14,
                          left: "50%",
                          transform: "translateX(-50%)",
                          background: "rgba(69, 47, 28, 0.72)",
                          color: "#ffffff",
                          padding: "8px 14px",
                          borderRadius: 12,
                          fontSize: 12,
                          whiteSpace: "nowrap",
                          pointerEvents: "none",
                        }}
                      >
                        Pass {currentPass + 1} · {PASS_LABELS[currentPass]} ·{" "}
                        {toolMode === null
                          ? "Pan Image"
                          : toolMode === "bruise"
                          ? "Bruise Brush"
                          : "Erase"}
                      </div>
                    </>
                  ) : (
                    <div
                      style={{
                        width: "100%",
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 24,
                        color: "#2f2f2f",
                      }}
                    >
                      Photo
                    </div>
                  )}
                </div>

                <div style={{ display: "grid", gap: 14 }}>
                  {PASS_LABELS.map((label, idx) => {
                    const isSaved = !!savedSelections[idx];
                    const isCurrent = currentPass === idx;

                    return (
                      <div
                        key={label}
                        onClick={() => {
                          setCurrentPass(idx as PassIndex);
                          setResult(null);
                          if (savedSelections[idx]) loadMaskToCanvas(savedSelections[idx]);
                          else clearMask();
                        }}
                        style={{
                          background: isSaved ? "#e7f3e7" : "#ffffff",
                          border: isSaved
                            ? "1.6px solid #b8d6ba"
                            : isCurrent
                            ? "2px solid #3563f0"
                            : "1.6px solid #bebebe",
                          borderRadius: 4,
                          padding: "12px 14px",
                          minHeight: 94,
                          cursor: "pointer",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "baseline",
                            marginBottom: 10,
                          }}
                        >
                          <div style={{ fontSize: 18, fontWeight: 800 }}>Pass {idx + 1}</div>
                          <div style={{ fontSize: 14, color: "#727272", fontWeight: 500 }}>
                            {label}
                          </div>
                        </div>

                        <div style={{ fontSize: 11, color: "#8a8a8a", marginBottom: 10 }}>
                          {isSaved ? `Pass ${idx + 1}: ${savedCounts[idx]} px` : "Not saved"}
                        </div>

                        {idx > 0 && (
                          <label
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              fontSize: 11,
                              color: "#757575",
                              marginBottom: 10,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={sameAsPrevious[idx]}
                              onChange={(e) => {
                                const next = [...sameAsPrevious] as [boolean, boolean, boolean];
                                next[idx] = e.target.checked;
                                setSameAsPrevious(next);
                                if (currentPass !== idx) setCurrentPass(idx as PassIndex);
                                if (e.target.checked) {
                                  const prev = savedSelections[idx - 1];
                                  if (prev) loadMaskToCanvas(prev);
                                } else {
                                  clearMask();
                                }
                              }}
                            />
                            Same as previous
                          </label>
                        )}

                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                          <button
                            className="save-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!image) return;

                              if (currentPass !== idx) {
                                setCurrentPass(idx as PassIndex);
                                if (savedSelections[idx]) loadMaskToCanvas(savedSelections[idx]);
                                else clearMask();
                                return;
                              }

                              if (isSaved) clearPass(idx as PassIndex);
                              else savePass(idx as PassIndex);
                            }}
                            style={{
                              minWidth: 74,
                              height: 34,
                              borderRadius: 14,
                              border: "2px solid #3563f0",
                              background: "#3563f0",
                              color: "#ffffff",
                              fontWeight: 700,
                              fontSize: 12,
                              cursor: "pointer",
                            }}
                          >
                            {isSaved ? "Cancel" : "Save"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div
                className="card"
                style={{
                  minHeight: 150,
                  padding: "18px 30px",
                  opacity: 0.58,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "end",
                  gap: 20,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 17,
                      fontWeight: 800,
                      color: "#8b8b8b",
                      marginBottom: 12,
                    }}
                  >
                    Recovery tracking (coming soon)
                  </div>
                  <div style={{ color: "#8c8c8c", fontSize: 14, lineHeight: 1.45 }}>
                    Suggested re-check timing: compare another photo
                    <br />
                    after 24 hours to observe a clearer recovery trend.
                  </div>
                </div>

                <button
                  disabled
                  style={{
                    minWidth: 60,
                    height: 30,
                    borderRadius: 10,
                    border: "2px solid #bcbcbc",
                    background: "#ffffff",
                    color: "#9b9b9b",
                    fontWeight: 700,
                    fontSize: 12,
                  }}
                >
                  Start
                </button>
              </div>

              <canvas
                ref={roiCanvasRef}
                width={FRAME_SIZE}
                height={FRAME_SIZE}
                style={{ display: "none" }}
              />
            </section>

            {/* CENTER COLUMN */}
            <section style={{ display: "grid", gap: 26 }}>
              <div className="card" style={{ minHeight: 344, padding: "16px 28px 18px 28px" }}>
                <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>
                  Bruise healing stage
                </div>

                <div style={{ marginBottom: 18 }}>
                  <div
                    className="stage-pills-grid"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
                      gap: 8,
                      alignItems: "start",
                      marginBottom: 8,
                    }}
                  >
                    {(["S1", "S2", "S3", "S4", "S5"] as const).map((slotLabel, index) => {
                      const slot = (index + 1) as 1 | 2 | 3 | 4 | 5;
                      const active = healingStage ? healingStage.slot === slot : false;

                      return (
                        <div
                          key={slotLabel}
                          style={{
                            display: "flex",
                            justifyContent: "center",
                            position: "relative",
                            paddingBottom: active ? 12 : 0,
                          }}
                        >
                          <div
                            className="stage-pill"
                            style={{
                              width: "100%",
                              maxWidth: 66,
                              height: 30,
                              borderRadius: 16,
                              border: active ? "2px solid #ff4b1f" : "2px solid #b6b6b6",
                              background: "#ffffff",
                              color: result ? "#666666" : "#bcbcbc",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 13,
                              fontWeight: 500,
                            }}
                          >
                            {slotLabel}
                          </div>

                          {active && (
                            <div
                              style={{
                                position: "absolute",
                                top: 28,
                                left: "50%",
                                transform: "translateX(-50%)",
                                width: 0,
                                height: 0,
                                borderLeft: "11px solid transparent",
                                borderRight: "11px solid transparent",
                                borderTop: "20px solid #ff4b1f",
                              }}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ marginBottom: 8 }}>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr",
                        height: 28,
                        overflow: "hidden",
                        borderRadius: 2,
                      }}
                    >
                      <div
                        style={{
                          background: result ? "#d74236" : "#d7d7d7",
                          border: "1px solid #bdbdbd",
                          borderRight: "none",
                        }}
                      />
                      <div
                        style={{
                          background: result ? "#5044c6" : "#d7d7d7",
                          border: "1px solid #bdbdbd",
                          borderRight: "none",
                        }}
                      />
                      <div
                        style={{
                          background: result ? "#b06b38" : "#d7d7d7",
                          border: "1px solid #bdbdbd",
                          borderRight: "none",
                        }}
                      />
                      <div
                        style={{
                          background: result ? "#dfa635" : "#d7d7d7",
                          border: "1px solid #bdbdbd",
                          borderRight: "none",
                        }}
                      />
                      <div
                        style={{
                          background:
                            "repeating-linear-gradient(45deg, #efefef, #efefef 8px, #d9d9d9 8px, #d9d9d9 12px)",
                          border: "1px dashed #bdbdbd",
                        }}
                      />
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr",
                      gap: 6,
                    }}
                  >
                    {["Early\nRed", "Blue\nPurple", "Brown\nGreen", "Yellow", "Resolved"].map(
                      (label, idx) => (
                        <div
                          key={idx}
                          style={{
                            textAlign: "center",
                            whiteSpace: "pre-line",
                            fontSize: 14,
                            lineHeight: 1.28,
                            color: result ? "#323232" : "#b4b4b4",
                          }}
                        >
                          {label}
                        </div>
                      )
                    )}
                  </div>
                </div>

                {!result ? (
                  <div
                    style={{
                      color: "#b8b8b8",
                      fontSize: 14,
                      lineHeight: 1.45,
                      maxWidth: 510,
                    }}
                  >
                    <div style={{ marginBottom: 8 }}>
                      Estimates the bruise healing stage from dominant bruise color patterns.
                    </div>
                    <div>
                      This card will place the current bruise appearance within a simplified
                      healing-stage model after analysis.
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ marginBottom: 14 }}>
                      <div
                        style={{
                          display: "inline-flex",
                          minWidth: 94,
                          height: 44,
                          padding: "0 18px",
                          borderRadius: 14,
                          background: "#dedede",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 18,
                          fontWeight: 800,
                          marginBottom: 12,
                        }}
                      >
                        Stage {healingStage?.slot}
                      </div>

                      <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>
                        {healingStage?.title}
                      </div>

                      <div
                        style={{
                          fontSize: 14,
                          color: "#6b6b6b",
                          lineHeight: 1.45,
                          maxWidth: 530,
                        }}
                      >
                        {healingStage?.description}
                        {result.stageContextLine && <div style={{ marginTop: 8 }}>{result.stageContextLine}</div>}
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="card" style={{ minHeight: 330, padding: "16px 28px 18px 28px" }}>
                <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>
                  Quantitative summary
                </div>

                {!result ? (
                  <>
                    <div
                      style={{
                        fontSize: 16,
                        fontWeight: 800,
                        color: "#b8b8b8",
                        marginBottom: 14,
                      }}
                    >
                      Stage confidence
                    </div>

                    <div style={{ paddingLeft: 14, paddingRight: 14, marginBottom: 34 }}>
                      <div style={{ display: "grid", gap: 12 }}>
                        {summaryBars.map((item) => (
                          <div
                            key={item.key}
                            className="confidence-row"
                            style={{
                              display: "grid",
                              gridTemplateColumns: "46px 1fr 92px",
                              alignItems: "center",
                              gap: 12,
                            }}
                          >
                            <div style={{ fontSize: 14, color: "#b8b8b8" }}>{item.label}</div>
                            <div
                              style={{
                                height: 10,
                                background: "#d6d6d6",
                                borderRadius: 999,
                              }}
                            />
                            <div style={{ fontSize: 14, color: "#b8b8b8" }}>0.00 / 1.00</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div
                      style={{
                        fontSize: 14,
                        color: "#b8b8b8",
                        lineHeight: 1.45,
                        maxWidth: 510,
                      }}
                    >
                      Displays numerical indicators derived from the selected bruise region,
                      including stage confidence and analysis scores.
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 14 }}>
                      Stage confidence
                    </div>

                    <div style={{ paddingLeft: 14, paddingRight: 14, marginBottom: 24 }}>
                      <div style={{ display: "grid", gap: 12 }}>
                        {summaryBars.map((item) => (
                          <div
                            key={item.key}
                            className="confidence-row"
                            style={{
                              display: "grid",
                              gridTemplateColumns: "46px 1fr 92px",
                              alignItems: "center",
                              gap: 12,
                            }}
                          >
                            <div style={{ fontSize: 14 }}>{item.label}</div>
                            <div
                              style={{
                                height: 10,
                                background: "#dddddd",
                                borderRadius: 999,
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{
                                  width: `${Math.max(item.score * 100, 3)}%`,
                                  height: "100%",
                                  background: stageColor(item.key),
                                  borderRadius: 999,
                                }}
                              />
                            </div>
                            <div style={{ fontSize: 14 }}>{formatScore(item.score)}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 14,
                      }}
                    >
                      <div
                        style={{
                          background: "#efefef",
                          borderRadius: 3,
                          padding: "16px 16px 14px 16px",
                        }}
                      >
                        <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 12 }}>
                          Bruise intensity score
                        </div>
                        <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
                          {formatScore(result.intensityScore)}
                        </div>
                        <div style={{ fontSize: 14, color: "#6d6d6d" }}>{result.intensityLabel}</div>
                      </div>

                      <div
                        style={{
                          background: "#efefef",
                          borderRadius: 3,
                          padding: "16px 16px 14px 16px",
                        }}
                      >
                        <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 12 }}>
                          Selection consistency score
                        </div>
                        <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
                          {formatScore(result.consistencyScore)}
                        </div>
                        <div style={{ fontSize: 14, color: "#6d6d6d" }}>
                          {result.consistencyLabel}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </section>

            {/* RIGHT COLUMN */}
            <section style={{ display: "grid", gap: 26 }}>
              <div className="card" style={{ minHeight: 276, padding: "16px 28px" }}>
                <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>
                  Bruise intensity
                </div>

                {!result ? (
                  <>
                    <div
                      style={{
                        color: "#b8b8b8",
                        fontSize: 14,
                        lineHeight: 1.45,
                        maxWidth: 360,
                        marginBottom: 52,
                      }}
                    >
                      Estimates how visually strong the bruise core appears relative to surrounding
                      skin.
                    </div>

                    <div
                      className="intensity-grid"
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                        gap: 10,
                      }}
                    >
                      {["Mild", "Moderate", "Strong", "Very Strong"].map((label) => (
                        <div
                          key={label}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                          }}
                        >
                          <div
                            style={{
                              width: 86,
                              height: 86,
                              borderRadius: "50%",
                              background: "#f3f3f3",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              marginBottom: 16,
                              padding: 8,
                            }}
                          >
                            <div
                              style={{
                                width: "100%",
                                height: "100%",
                                borderRadius: "50%",
                                background: "#d3d3d3",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                padding: 8,
                              }}
                            >
                              <div
                                style={{
                                  width: 54,
                                  height: 54,
                                  borderRadius: "50%",
                                  background: "#a8a2a2",
                                }}
                              />
                            </div>
                          </div>

                          <div
                            className="choice-pill"
                            style={{
                              width: "100%",
                              maxWidth: 102,
                              height: 32,
                              borderRadius: 16,
                              border: "2px solid #c3c3c3",
                              color: "#b8b8b8",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 13,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {label}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <div
                      style={{
                        color: "#6d6d6d",
                        fontSize: 14,
                        lineHeight: 1.45,
                        maxWidth: 360,
                        marginBottom: 22,
                      }}
                    >
                      <div>{result.intensityLines[0]}</div>
                      <div style={{ marginTop: 2 }}>{result.intensityLines[1]}</div>
                    </div>

                    <div
                      className="intensity-grid"
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                        gap: 10,
                      }}
                    >
                      {[
                        { label: "Mild", core: "#b8b4b4" },
                        { label: "Moderate", core: "#a8a2a2" },
                        { label: "Strong", core: "#787878" },
                        { label: "Very Strong", core: "#111111" },
                      ].map((item, idx) => {
                        const active = intensityIndex(result.intensityLabel) === idx;
                        return (
                          <div
                            key={item.label}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                            }}
                          >
                            <div
                              style={{
                                width: 86,
                                height: 86,
                                borderRadius: "50%",
                                background: "#f5f5f5",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                marginBottom: 16,
                                padding: 8,
                              }}
                            >
                              <div
                                style={{
                                  width: "100%",
                                  height: "100%",
                                  borderRadius: "50%",
                                  background: "#dddddd",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  padding: 8,
                                }}
                              >
                                <div
                                  style={{
                                    width: 54,
                                    height: 54,
                                    borderRadius: "50%",
                                    background: item.core,
                                  }}
                                />
                              </div>
                            </div>

                            <div
                              className="choice-pill"
                              style={{
                                width: "100%",
                                maxWidth: 102,
                                height: 32,
                                borderRadius: 16,
                                border: active ? "2px solid #ff4b1f" : "2px solid #b7b7b7",
                                color: "#666666",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 13,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {item.label}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              <div className="card" style={{ minHeight: 272, padding: "16px 28px" }}>
                <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>
                  Selection consistency
                </div>

                {!result ? (
                  <>
                    <div
                      style={{
                        color: "#b8b8b8",
                        fontSize: 14,
                        lineHeight: 1.45,
                        maxWidth: 360,
                        marginBottom: 108,
                      }}
                    >
                      Measures how consistent the bruise boundary selections are across repeated
                      passes.
                    </div>

                    <div
                      className="consistency-grid"
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                        gap: 16,
                      }}
                    >
                      {["Low", "Moderate", "High"].map((label) => (
                        <div
                          key={label}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                          }}
                        >
                          <div
                            className="choice-pill"
                            style={{
                              width: "100%",
                              maxWidth: 76,
                              height: 32,
                              borderRadius: 16,
                              border: "2px solid #c3c3c3",
                              color: "#b8b8b8",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 13,
                            }}
                          >
                            {label}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <div
                      style={{
                        color: "#6d6d6d",
                        fontSize: 14,
                        lineHeight: 1.45,
                        maxWidth: 360,
                        marginBottom: 18,
                      }}
                    >
                      <div>{result.consistencyMeaningLines[0]}</div>
                      <div style={{ marginTop: 2 }}>{result.consistencyMeaningLines[1]}</div>
                    </div>

                    <div
                      className="consistency-grid"
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                        gap: 16,
                      }}
                    >
                      {["Low", "Moderate", "High"].map((label, idx) => {
                        const active = consistencyIndex(result.consistencyLabel) === idx;
                        const innerScale = idx === 0 ? 0.6 : idx === 1 ? 0.84 : 0.96;

                        return (
                          <div
                            key={label}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                            }}
                          >
                            <div
                              style={{
                                width: 88,
                                height: 88,
                                borderRadius: "50%",
                                background: "#eccf7d",
                                position: "relative",
                                marginBottom: 14,
                              }}
                            >
                              <div
                                style={{
                                  position: "absolute",
                                  inset: 7,
                                  borderRadius: "50%",
                                  background: "#7fc1ea",
                                }}
                              />
                              <div
                                style={{
                                  position: "absolute",
                                  left: "50%",
                                  top: "50%",
                                  width: 88 * innerScale,
                                  height: 88 * innerScale,
                                  transform: "translate(-50%, -50%)",
                                  borderRadius: "50%",
                                  background: "#7d7ae4",
                                }}
                              />
                            </div>

                            <div
                              className="choice-pill"
                              style={{
                                width: "100%",
                                maxWidth: 76,
                                height: 32,
                                borderRadius: 16,
                                border: active ? "2px solid #ff4b1f" : "2px solid #b7b7b7",
                                color: "#3f3f3f",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 13,
                              }}
                            >
                              {label}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              <div className="card" style={{ minHeight: 134, padding: "16px 28px" }}>
                <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>Analysis note</div>
                <div
                  style={{
                    color: "#777777",
                    fontSize: 12,
                    lineHeight: 1.5,
                    maxWidth: 390,
                  }}
                >
                  This tool provides an image-based interpretation only and does not diagnose a
                  medical condition. Lighting, skin tone, camera quality, and selection choices can
                  affect the result. Repeat photos taken 24 hours or more apart are more useful for
                  recovery tracking.
                </div>
              </div>
            </section>
          </div>
        </main>
      </>
    </>
  );
}