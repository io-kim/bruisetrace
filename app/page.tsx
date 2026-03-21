"use client";

import { useRef, useState } from "react";

type ToolMode = "bruise" | "erase" | null;
type SavedMask = Uint8ClampedArray | null;
type BruiseAgeKey =
  | "within24h"
  | "day1to2"
  | "day3to4"
  | "day5to7"
  | "day8to10"
  | "day11to13"
  | "day14plus"
  | "unknown";

type StageKey = "red" | "blue" | "purple" | "brown" | "yellow" | "resolved";
type ConsistencyLabel = "Low" | "Moderate" | "High";
type IntensityLabel = "Mild" | "Moderate" | "Strong" | "Very Strong";
type AlignmentLabel =
  | "Much Slower"
  | "Slightly Slower"
  | "On Track"
  | "Slightly Faster"
  | "Much Faster"
  | "Estimated";

type StageConfidenceItem = {
  key: Exclude<StageKey, "resolved">;
  label: string;
  score: number;
};

type AnalysisResult = {
  stageKey: StageKey;
  stageLabel: string;
  expectedStageKey: StageKey | null;
  expectedStageLabel: string | null;
  alignmentLabel: AlignmentLabel;
  alignmentHeadline: string;
  alignmentLines: string[];
  timingMode: "reported" | "estimated";
  stageSummaryLines: string[];
  stageConfidenceAll: StageConfidenceItem[];
  intensityLabel: IntensityLabel;
  intensityLines: string[];
  intensityScore: number;
  consistencyLabel: ConsistencyLabel;
  consistencyMeaningLines: string[];
  consistencyScore: number;
};

const CARD_MAX = 934;
const SIDEBAR_W = 120;
const MAIN_GAP = 12;
const MAIN_W = 802;
const RIGHT_COL_W = 220;
const LEFT_PHOTO_W = 570;
const FRAME_SIZE = 570;
const PAN_PADDING = 60;

const DEFAULT_ZOOM = 1;
const BRUISE_BRUSH_MIN = 18;
const BRUISE_BRUSH_MAX = 96;
const ERASE_BRUSH_MIN = 14;
const ERASE_BRUSH_MAX = 80;
const DEFAULT_BRUISE_BRUSH = 58;
const DEFAULT_ERASE_BRUSH = 46;

const AGE_OPTIONS: { key: BruiseAgeKey; label: string }[] = [
  { key: "unknown", label: "Unknown" },
  { key: "within24h", label: "Within 24h" },
  { key: "day1to2", label: "1-2 days" },
  { key: "day3to4", label: "3-4 days" },
  { key: "day5to7", label: "5-7 days" },
  { key: "day8to10", label: "8-10 days" },
  { key: "day11to13", label: "11-13 days" },
  { key: "day14plus", label: "14+ days" },
];

const PASS_NAMES = ["Pass 1", "Pass 2", "Pass 3"] as const;

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
    brown: "Brown Green",
    yellow: "Yellow",
    resolved: "Resolved",
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
  temperature = 0.82
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

function getExpectedStageFromAge(age: BruiseAgeKey | null): StageKey | null {
  switch (age) {
    case "within24h":
      return "red";
    case "day1to2":
      return "blue";
    case "day3to4":
      return "purple";
    case "day5to7":
      return "brown";
    case "day8to10":
      return "yellow";
    case "day11to13":
      return "yellow";
    case "day14plus":
      return "resolved";
    default:
      return null;
  }
}

function getEstimatedAgeTextFromStage(stage: StageKey) {
  switch (stage) {
    case "red":
      return "likely early in healing, often within roughly the first couple of days";
    case "blue":
      return "likely early-to-mid healing, often around the first few days";
    case "purple":
      return "likely mid healing, often around several days after onset";
    case "brown":
      return "likely later mid healing, often around roughly 5-7 days";
    case "yellow":
      return "likely later healing, often around roughly 8-13 days";
    case "resolved":
      return "likely late healing or near-resolved, often around 2 weeks or more";
  }
}

function getStageOrder(key: StageKey) {
  return {
    red: 0,
    blue: 1,
    purple: 2,
    brown: 3,
    yellow: 4,
    resolved: 5,
  }[key];
}

function getStageBarPosition(key: StageKey | null | undefined) {
  if (!key) return 50;
  return {
    red: 8,
    blue: 29,
    purple: 45,
    brown: 56,
    yellow: 74,
    resolved: 91,
  }[key];
}

function getLuminance(r: number, g: number, b: number) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function countMaskPixels(mask: Uint8ClampedArray | null) {
  if (!mask) return 0;
  let count = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) count++;
  return count;
}

function expandMask(
  mask: Uint8ClampedArray,
  width: number,
  height: number,
  radius = 2
) {
  const expanded = new Uint8ClampedArray(width * height);

  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const x = i % width;
    const y = Math.floor(i / width);

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        expanded[ny * width + nx] = 1;
      }
    }
  }

  return expanded;
}

function getDisplayedSize(
  currentZoom: number,
  natural: { width: number; height: number }
) {
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
  natural: { width: number; height: number }
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

function centerImage(
  currentZoom: number,
  natural: { width: number; height: number }
) {
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
  natural: { width: number; height: number }
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
  if (rawCount < 8) return rawMask;

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
  const minClusterSize = Math.max(8, Math.floor(rawCount * 0.01));
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
  const keepCount = Math.max(12, Math.floor(rawPixels.length * 0.35));
  const fallback = new Uint8ClampedArray(width * height);
  for (let i = 0; i < keepCount && i < rawPixels.length; i++) fallback[rawPixels[i].idx] = 1;
  return fallback;
}

function buildConsensusMask(refinedMasks: SavedMask[]) {
  const countMap = new Uint8ClampedArray(FRAME_SIZE * FRAME_SIZE);
  let available = 0;

  for (const mask of refinedMasks) {
    if (!mask) continue;
    available++;
    for (let i = 0; i < mask.length; i++) if (mask[i]) countMap[i] += 1;
  }

  if (!available) return { consensus: null as Uint8ClampedArray | null, countMap };

  const consensus = new Uint8ClampedArray(FRAME_SIZE * FRAME_SIZE);
  let strongCount = 0;

  for (let i = 0; i < countMap.length; i++) {
    if (countMap[i] >= 2) {
      consensus[i] = 1;
      strongCount++;
    }
  }

  if (strongCount < 30) {
    for (let i = 0; i < countMap.length; i++) consensus[i] = countMap[i] >= 1 ? 1 : 0;
  }

  return { consensus, countMap };
}

function computeSelectionConsistency(refinedMasks: SavedMask[]) {
  const validMasks = refinedMasks.filter(Boolean) as Uint8ClampedArray[];
  if (validMasks.length <= 1) return 0;

  let intersection = 0;
  let union = 0;

  for (let i = 0; i < FRAME_SIZE * FRAME_SIZE; i++) {
    let count = 0;
    for (const mask of validMasks) if (mask[i]) count++;
    if (count > 0) union++;
    if (count === validMasks.length) intersection++;
  }

  if (union === 0) return 0;
  return intersection / union;
}

function ChevronIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path
        d="M3 1.5L6.5 5L3 8.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.7" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="8" cy="4.5" r="1" fill="currentColor" />
      <path d="M8 7V11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M5.5 4.5H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M5.5 9H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M5.5 13.5H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M2.7 4.5H2.71" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M2.7 9H2.71" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M2.7 13.5H2.71" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function AnalysisIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M3 14.5V3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M3 14.5H15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="M6 11L8.3 8.3L10.1 9.9L13 5.8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12.1 5.8H13.8V7.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 10.5V3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="M5.4 5.8L8 3.2L10.6 5.8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M3 12.5H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
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
  const [selectionDirty, setSelectionDirty] = useState(false);

  const [bruiseAge, setBruiseAge] = useState<BruiseAgeKey | null>(null);
  const [currentPass, setCurrentPass] = useState(0);

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

  const currentObjectUrlRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const roiCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const resultSectionRef = useRef<HTMLDivElement | null>(null);

  const dragStartRef = useRef({ x: 0, y: 0 });
  const offsetStartRef = useRef({ x: 0, y: 0 });

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
    setSelectionDirty(false);
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

    const step = 4;
    const radius = 1.2;

    for (let y = 0; y < FRAME_SIZE; y += step) {
      for (let x = 0; x < FRAME_SIZE; x += step) {
        const i = (y * FRAME_SIZE + x) * 4;
        if (maskImg[i + 3] < 10) continue;

        overlayCtx.fillStyle = "rgba(87, 106, 228, 0.82)";
        overlayCtx.beginPath();
        overlayCtx.arc(x + 0.5, y + 0.5, radius, 0, Math.PI * 2);
        overlayCtx.fill();
      }
    }
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
      setSelectionDirty(true);
    } else if (toolMode === "erase") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      setSelectionDirty(true);
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

    const displayed = getDisplayedSize(zoom, imgNaturalSize);

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

  function getMaskFromOverlayCanvas() {
    const overlayCanvas = overlayCanvasRef.current;
    if (!overlayCanvas) return null;
    const overlayCtx = overlayCanvas.getContext("2d", { willReadFrequently: true });
    if (!overlayCtx) return null;

    const overlayData = overlayCtx.getImageData(0, 0, FRAME_SIZE, FRAME_SIZE).data;
    const out = new Uint8ClampedArray(FRAME_SIZE * FRAME_SIZE);

    for (let i = 0; i < FRAME_SIZE * FRAME_SIZE; i++) {
      out[i] = overlayData[i * 4 + 3] > 1 ? 1 : 0;
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

    setSelectionDirty(false);
    redrawOverlay();
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
    setImgOffset(clampOffset(rawX, rawY, zoom, imgNaturalSize));
  }

  function endMove() {
    setDraggingImage(false);
  }

  function savePass(passIdx: number) {
    if (!image) return;

    const roiCtx = drawCurrentViewToCanvas();
    if (!roiCtx) return;
    const roiData = roiCtx.getImageData(0, 0, FRAME_SIZE, FRAME_SIZE).data;

    let rawMask: Uint8ClampedArray | null = null;

    if (passIdx > 0 && sameAsPrevious[passIdx]) {
      const prev = savedSelections[passIdx - 1];
      if (!prev) return;
      rawMask = prev.slice();
    } else {
      rawMask = getMaskFromOverlayCanvas();
      if (!rawMask || countMaskPixels(rawMask) < 1) rawMask = getMaskFromCanvas();
      if (!rawMask || countMaskPixels(rawMask) < 1) return;

      rawMask = expandMask(rawMask, FRAME_SIZE, FRAME_SIZE, 2);
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

    if (passIdx < 2) setCurrentPass(passIdx + 1);
  }

  function clearPass(passIdx: number) {
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
  }

  function scrollToResultSection() {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        resultSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  function analyzeConsensus() {
    const roiCtx = drawCurrentViewToCanvas();
    if (!roiCtx) return;
    const availableRefined = refinedSelections.filter(Boolean).length;
    if (availableRefined === 0) return;

    const roiData = roiCtx.getImageData(0, 0, FRAME_SIZE, FRAME_SIZE).data;
    const { consensus } = buildConsensusMask(refinedSelections);
    if (!consensus || countMaskPixels(consensus) < 8) return;

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
    let roiSumV = 0;
    let roiLumSum = 0;
    let consensusPixels = 0;

    for (let i = 0; i < consensus.length; i++) {
      if (!consensus[i]) continue;
      const p = i * 4;
      const r = roiData[p];
      const g = roiData[p + 1];
      const b = roiData[p + 2];
      const { h, s, v } = rgbToHsv(r, g, b);
      const lum = getLuminance(r, g, b);
      roiSumV += v;
      roiLumSum += lum;
      consensusPixels++;
      allPixels.push({ r, g, b, h, s, v, lum, idx: i });
    }

    if (consensusPixels < 8) return;

    const roiMeanV = roiSumV / consensusPixels;
    const isRedHue = (h: number) => h <= 20 || h >= 338;
    const isBlueHue = (h: number) => h >= 190 && h <= 250;
    const isPurpleHue = (h: number) => h >= 235 && h <= 320;
    const isBrownHue = (h: number) => h >= 14 && h <= 48;
    const isYellowHue = (h: number) => h > 42 && h <= 75;

    const bruiseLikePixels = allPixels.filter((px) => {
      const resolvedLike = px.s < 0.15 && px.v > Math.max(0.64, roiMeanV - 0.01);
      const strongChromatic =
        (isRedHue(px.h) ||
          isBlueHue(px.h) ||
          isPurpleHue(px.h) ||
          isBrownHue(px.h) ||
          isYellowHue(px.h)) &&
        px.s >= 0.08;
      const darkCool = px.h >= 210 && px.h <= 320 && px.v <= roiMeanV + 0.04;
      const mutedWarm = px.h >= 18 && px.h <= 70 && px.s >= 0.06 && px.v <= 0.82;
      return resolvedLike || strongChromatic || darkCool || mutedWarm;
    });

    const stagePixels =
      bruiseLikePixels.length >= Math.max(8, Math.floor(allPixels.length * 0.18))
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
    const coreCount = Math.max(8, Math.floor(sortedByLum.length * 0.35));
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

      const resolvedLike = px.s < 0.15 && px.v > Math.max(0.64, roiMeanV - 0.01);
      if (resolvedLike) resolvedWeight += 0.98 + clamp(px.v - 0.56, 0, 0.42);

      if (isRedHue(px.h) && px.s >= 0.11)
        redWeight +=
          0.46 +
          clamp(redDom * 1.35, 0, 0.52) +
          clamp((px.s - 0.14) * 0.95, 0, 0.34);
      if (isBlueHue(px.h) && px.s >= 0.08)
        blueWeight +=
          0.76 +
          clamp(blueDom * 1.9, 0, 0.82) +
          clamp((0.76 - px.v) * 0.95, 0, 0.42) +
          clamp((px.s - 0.09) * 1.05, 0, 0.42);
      if (isPurpleHue(px.h) && px.s >= 0.085)
        purpleWeight +=
          0.84 +
          clamp(purpleDom * 2.05, 0, 0.92) +
          clamp((0.74 - px.v) * 0.95, 0, 0.42) +
          clamp((px.s - 0.095) * 1.08, 0, 0.42);
      if (
        isBrownHue(px.h) &&
        px.s >= 0.06 &&
        px.v <= 0.82 &&
        px.r >= px.g * 0.94 &&
        px.g >= px.b * 0.78
      )
        brownWeight +=
          0.82 +
          clamp(warmDom * 1.58, 0, 0.62) +
          clamp((0.8 - px.v) * 1.0, 0, 0.42) +
          clamp((px.s - 0.06) * 0.65, 0, 0.2);
      if (isYellowHue(px.h) && px.s >= 0.08 && px.v >= 0.44)
        yellowWeight +=
          0.78 + clamp(warmDom * 1.45, 0, 0.58) + clamp((px.v - 0.46) * 0.86, 0, 0.4);

      if (px.h >= 248 && px.h <= 306 && px.s >= 0.13) purpleWeight += 0.22;
      if (px.h >= 192 && px.h <= 238 && px.v < 0.7) blueWeight += 0.18;
      if (px.h >= 18 && px.h <= 44 && px.v < 0.74) brownWeight += 0.16;
      if (px.h >= 48 && px.h <= 70 && px.v > 0.58) yellowWeight += 0.14;
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
        redRatio * 0.96 +
        clamp(redDominance, 0, 0.34) * 0.76 +
        clamp(coreRedDominance, 0, 0.34) * 0.44 +
        clamp(hsvAll.s - 0.2, 0, 0.34) * 0.2,
      blue:
        blueRatio * 1.42 +
        clamp(blueDominance, 0, 0.44) * 1.18 +
        clamp(coreBlueDominance, 0, 0.44) * 0.84 +
        clamp((roiLumSum / consensusPixels - coreMeanLum) / 92, 0, 0.42) * 0.48,
      purple:
        purpleRatio * 1.58 +
        clamp(purpleDominance, 0, 0.46) * 1.18 +
        clamp(corePurpleDominance, 0, 0.46) * 0.86 +
        clamp((roiLumSum / consensusPixels - coreMeanLum) / 88, 0, 0.42) * 0.46,
      brown:
        brownRatio * 1.5 +
        clamp(warmDominance, 0, 0.36) * 0.7 +
        clamp(coreWarmDominance, 0, 0.36) * 0.5 +
        clamp(0.78 - hsvAll.v, 0, 0.36) * 0.82,
      yellow:
        yellowRatio * 1.46 +
        clamp(warmDominance, 0, 0.36) * 0.56 +
        clamp(coreWarmDominance, 0, 0.36) * 0.36 +
        clamp(hsvAll.v - 0.52, 0, 0.36) * 0.84,
      resolved:
        resolvedRatio * 1.96 +
        clamp(0.19 - hsvAll.s, 0, 0.19) * 2.05 +
        clamp(hsvAll.v - 0.66, 0, 0.24) * 1.24 +
        clamp(0.17 - coreMeanS, 0, 0.17) * 1.34,
    };

    if (isRedHue(hsvCore.h) && hsvCore.s >= 0.17) stageScoresRaw.red += 0.08;
    if (isBlueHue(hsvCore.h) && hsvCore.s >= 0.085) stageScoresRaw.blue += 0.24;
    if (isPurpleHue(hsvCore.h) && hsvCore.s >= 0.09) stageScoresRaw.purple += 0.3;
    if (isBrownHue(hsvCore.h) && hsvCore.v <= 0.76) stageScoresRaw.brown += 0.24;
    if (isYellowHue(hsvAll.h) && hsvAll.v >= 0.54) stageScoresRaw.yellow += 0.18;
    if (hsvAll.s < 0.12 && hsvAll.v > 0.69) stageScoresRaw.resolved += 0.38;

    stageScoresRaw.purple += Math.min(redRatio, blueRatio) * 0.34;
    stageScoresRaw.brown += Math.min(purpleRatio, yellowRatio) * 0.18;
    stageScoresRaw.blue += Math.min(purpleRatio, blueRatio) * 0.06;

    stageScoresRaw.red -=
      purpleRatio * 0.72 +
      blueRatio * 0.42 +
      brownRatio * 0.2 +
      yellowRatio * 0.18 +
      resolvedRatio * 0.12;
    stageScoresRaw.blue -= redRatio * 0.12 + yellowRatio * 0.12;
    stageScoresRaw.purple -= yellowRatio * 0.08;
    stageScoresRaw.brown -= redRatio * 0.18 + blueRatio * 0.1;
    stageScoresRaw.yellow -=
      blueRatio * 0.1 + purpleRatio * 0.12 + clamp(0.54 - hsvAll.v, 0, 0.2) * 0.78;
    stageScoresRaw.resolved -=
      Math.max(redRatio, blueRatio, purpleRatio, brownRatio, yellowRatio) > 0.24 ? 0.32 : 0;

    if (redDominance < 0.05) stageScoresRaw.red -= 0.28;
    if (hsvAll.s < 0.17) stageScoresRaw.red -= 0.22;
    if (hsvCore.h > 26 && hsvCore.h < 335) stageScoresRaw.red -= 0.08;

    const stageScoresSmoothed: Record<StageKey, number> = {
      red: stageScoresRaw.red * 0.76 + stageScoresRaw.blue * 0.12 + stageScoresRaw.purple * 0.12,
      blue: stageScoresRaw.blue * 0.7 + stageScoresRaw.red * 0.08 + stageScoresRaw.purple * 0.22,
      purple:
        stageScoresRaw.purple * 0.68 +
        stageScoresRaw.blue * 0.16 +
        stageScoresRaw.red * 0.06 +
        stageScoresRaw.brown * 0.1,
      brown:
        stageScoresRaw.brown * 0.72 +
        stageScoresRaw.purple * 0.16 +
        stageScoresRaw.yellow * 0.12,
      yellow:
        stageScoresRaw.yellow * 0.76 +
        stageScoresRaw.brown * 0.16 +
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

    const normalized = softmaxStageScores(stageScores, 0.82);

    const stageConfidenceAll: StageConfidenceItem[] = [
      { key: "red", label: "Red", score: normalized.red },
      { key: "blue", label: "Blue", score: normalized.blue },
      { key: "purple", label: "Purple", score: normalized.purple },
      { key: "brown", label: "Brown", score: normalized.brown },
      { key: "yellow", label: "Yellow", score: normalized.yellow },
    ];

    const sortedAll = [
      { key: "red" as StageKey, score: normalized.red },
      { key: "blue" as StageKey, score: normalized.blue },
      { key: "purple" as StageKey, score: normalized.purple },
      { key: "brown" as StageKey, score: normalized.brown },
      { key: "yellow" as StageKey, score: normalized.yellow },
      { key: "resolved" as StageKey, score: normalized.resolved },
    ].sort((a, b) => b.score - a.score);

    const stageKey = sortedAll[0].key;
    const stageLabel = stageDisplayLabel(stageKey);
    const expectedStageKey = getExpectedStageFromAge(bruiseAge);
    const expectedStageLabel = expectedStageKey ? stageDisplayLabel(expectedStageKey) : null;

    let alignmentLabel: AlignmentLabel = "On Track";
    let alignmentHeadline = "Healing appears broadly on track";
    let alignmentLines = [
      "The current visual stage is broadly aligned with the expected stage for the reported timing.",
      "The image-based estimate and the reported timeline are pointing in a similar direction.",
    ];
    let timingMode: "reported" | "estimated" = "reported";

    if (bruiseAge === null || bruiseAge === "unknown") {
      timingMode = "estimated";
      alignmentLabel = "Estimated";
      alignmentHeadline = "Estimated timing from current visual stage";
      alignmentLines = [
        `Because the start date is unknown, the current visual stage suggests this bruise is ${getEstimatedAgeTextFromStage(
          stageKey
        )}.`,
        "This is a broad estimate only and can vary with skin tone, lighting, bruise depth, and image quality.",
      ];
    } else if (expectedStageKey) {
      const delta = getStageOrder(stageKey) - getStageOrder(expectedStageKey);

      if (delta <= -2) {
        alignmentLabel = "Much Slower";
        alignmentHeadline = "Healing appears slower than expected";
        alignmentLines = [
          `The current visual stage looks clearly earlier than the expected ${expectedStageLabel} stage for the reported timing.`,
          "This suggests slower visible recovery than expected, although lighting, bruise depth, and image quality can affect the estimate.",
        ];
      } else if (delta < 0) {
        alignmentLabel = "Slightly Slower";
        alignmentHeadline = "Healing appears slightly slower than expected";
        alignmentLines = [
          `The current visual stage looks somewhat earlier than the expected ${expectedStageLabel} stage for the reported timing.`,
          "This suggests somewhat slower visible recovery than expected.",
        ];
      } else if (delta >= 2) {
        alignmentLabel = "Much Faster";
        alignmentHeadline = "Healing appears faster than expected";
        alignmentLines = [
          `The current visual stage looks clearly later than the expected ${expectedStageLabel} stage for the reported timing.`,
          "This suggests faster visible recovery than expected.",
        ];
      } else if (delta > 0) {
        alignmentLabel = "Slightly Faster";
        alignmentHeadline = "Healing appears slightly faster than expected";
        alignmentLines = [
          `The current visual stage looks somewhat later than the expected ${expectedStageLabel} stage for the reported timing.`,
          "This suggests somewhat faster visible recovery than expected.",
        ];
      }
    }

    const darknessScore = clamp((152 - coreMeanLum) / 92, 0, 1);
    let intensityLabel: IntensityLabel = "Mild";
    let intensityLines = [
      "The selected bruise core appears relatively light overall.",
      "The overall intensity is interpreted as Mild.",
    ];

    if (darknessScore >= 0.78) {
      intensityLabel = "Very Strong";
      intensityLines = [
        "The selected bruise core appears very dark overall.",
        "The overall intensity is interpreted as Very Strong.",
      ];
    } else if (darknessScore >= 0.58) {
      intensityLabel = "Strong";
      intensityLines = [
        "The selected bruise core appears noticeably dark overall.",
        "The overall intensity is interpreted as Strong.",
      ];
    } else if (darknessScore >= 0.38) {
      intensityLabel = "Moderate";
      intensityLines = [
        "The selected bruise core appears moderately dark overall.",
        "The overall intensity is interpreted as Moderate.",
      ];
    }

    const savedCount = refinedSelections.filter(Boolean).length;
    const consistencyScore = clamp(computeSelectionConsistency(refinedSelections), 0, 1);
    const consistencyLabel: ConsistencyLabel =
      savedCount <= 1 ? "Low" : consistencyScore >= 0.75 ? "High" : consistencyScore >= 0.45 ? "Moderate" : "Low";

    let consistencyMeaningLines = [
      "This reflects how similar your bruise boundary selections were across repeated passes.",
      "It indicates selection reliability, not biological progression.",
    ];

    if (savedCount <= 1) {
      consistencyMeaningLines = [
        "Only one saved pass is available, so consistency cannot be compared across repeated selections.",
        "Save additional passes if you want a stronger reliability check.",
      ];
    } else if (consistencyLabel === "Moderate") {
      consistencyMeaningLines = [
        "This reflects how similar your bruise boundary selections were across repeated passes.",
        "A moderate result suggests the selected boundary was reasonably stable, but not perfectly consistent.",
      ];
    } else if (consistencyLabel === "Low") {
      consistencyMeaningLines = [
        "This reflects how similar your bruise boundary selections were across repeated passes.",
        "A low result suggests the selected boundary was harder to reproduce consistently.",
      ];
    }

    let stageSummaryLines = [
      "The image most closely matches the current visual stage shown here.",
      "This visual estimate should be read as image-based evidence, not as a final timeline conclusion by itself.",
    ];

    if (stageKey === "yellow") {
      stageSummaryLines = [
        "The image most closely matches the Yellow stage.",
        "This visual estimate should be read as image-based evidence, not as a final timeline conclusion by itself.",
      ];
    } else if (stageKey === "brown") {
      stageSummaryLines = [
        "The image most closely matches the Brown stage.",
        "This visual estimate should be read as image-based evidence, not as a final timeline conclusion by itself.",
      ];
    } else if (stageKey === "purple") {
      stageSummaryLines = [
        "The image most closely matches the Purple stage.",
        "This visual estimate should be read as image-based evidence, not as a final timeline conclusion by itself.",
      ];
    } else if (stageKey === "blue") {
      stageSummaryLines = [
        "The image most closely matches the Blue stage.",
        "This visual estimate should be read as image-based evidence, not as a final timeline conclusion by itself.",
      ];
    } else if (stageKey === "red") {
      stageSummaryLines = [
        "The image most closely matches the Red stage.",
        "This visual estimate should be read as image-based evidence, not as a final timeline conclusion by itself.",
      ];
    } else if (stageKey === "resolved") {
      stageSummaryLines = [
        "The image most closely matches a near-resolved stage.",
        "This visual estimate should be read as image-based evidence, not as a final timeline conclusion by itself.",
      ];
    }

    setResult({
      stageKey,
      stageLabel,
      expectedStageKey,
      expectedStageLabel,
      alignmentLabel,
      alignmentHeadline,
      alignmentLines,
      timingMode,
      stageSummaryLines,
      stageConfidenceAll,
      intensityLabel,
      intensityLines,
      intensityScore: darknessScore,
      consistencyLabel,
      consistencyMeaningLines,
      consistencyScore,
    });

    scrollToResultSection();
  }

  function handleUpload(file: File) {
    const newUrl = URL.createObjectURL(file);
    const tempImg = new Image();

    tempImg.onload = () => {
      const natural = { width: tempImg.naturalWidth, height: tempImg.naturalHeight };

      if (currentObjectUrlRef.current) URL.revokeObjectURL(currentObjectUrlRef.current);
      currentObjectUrlRef.current = newUrl;

      setImage(newUrl);
      setImgNaturalSize(natural);
      setZoom(DEFAULT_ZOOM);
      setImgOffset(centerImage(DEFAULT_ZOOM, natural));
      setToolMode(null);
      setHoverPoint(null);
      setSelectionDirty(false);
      setBruiseBrushSize(DEFAULT_BRUISE_BRUSH);
      setEraseBrushSize(DEFAULT_ERASE_BRUSH);
      setSavedSelections([null, null, null]);
      setRefinedSelections([null, null, null]);
      setSameAsPrevious([false, false, false]);
      setCurrentPass(0);
      setBruiseAge(null);
      setResult(null);
      hardResetOverlay();
      redrawOverlay();
      if (fileInputRef.current) fileInputRef.current.value = "";
    };

    tempImg.onerror = () => URL.revokeObjectURL(newUrl);
    tempImg.src = newUrl;
  }

  const displayed = getDisplayedSize(zoom, imgNaturalSize);
  const saveCount = savedSelections.filter(Boolean).length;
  const canAnalyze = !!image && saveCount >= 1;
  const hasImage = !!image;
  const hasAgeSelected = bruiseAge !== null;
  const sidebarAgeDone = hasAgeSelected;
  const sidebarUploadDone = hasImage;
  const sidebarSelectionDone = saveCount >= 1;

  const showBrushCursor = image && hoverPoint && (toolMode === "bruise" || toolMode === "erase");
  const previewRadius = currentBrushSize();

  const stageBarExpectedPosition = result?.expectedStageKey
    ? getStageBarPosition(result.expectedStageKey)
    : null;
  const stageBarVisualPosition = result ? getStageBarPosition(result.stageKey) : null;

  const consistencyIndex = { Low: 0, Moderate: 1, High: 2 }[
    result?.consistencyLabel ?? "Low"
  ];
  const intensityOrder = { Moderate: 0, Mild: 1, "Very Strong": 2, Strong: 3 }[
    result?.intensityLabel ?? "Mild"
  ];

  const infoTextColor = (done: boolean) => (done ? "#2d66ff" : "#1f2f46");
  const stepTextColor = (done: boolean) => (done ? "#8fa4c4" : "#b5becc");

  return (
    <>
      <style jsx global>{`
        html,
        body {
          margin: 0;
          padding: 0;
          background: #f5f6fa;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
          scroll-behavior: smooth;
        }
        * {
          box-sizing: border-box;
        }
        input[type="range"] {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 6px;
          border-radius: 999px;
          background: #d8dee9;
          outline: none;
        }
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 999px;
          background: #6f819c;
          border: 0;
          cursor: pointer;
        }
        input[type="range"]::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 999px;
          background: #6f819c;
          border: 0;
          cursor: pointer;
        }
        .card-soft {
          background: #ffffff;
          border: 1px solid #e6e8f0;
          border-radius: 20px;
          box-shadow: 0 12px 24px rgba(33, 49, 77, 0.08);
        }
        .hover-lift {
          transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease,
            background 0.18s ease, color 0.18s ease, opacity 0.18s ease;
        }
        .hover-lift:hover {
          transform: translateY(-1px);
        }
        .blue-hover:hover {
          box-shadow: 0 0 0 3px rgba(45, 102, 255, 0.1), 0 10px 20px rgba(45, 102, 255, 0.08);
        }
        .red-hover:hover:not(:disabled) {
          box-shadow: 0 0 0 3px rgba(255, 43, 43, 0.1), 0 14px 28px rgba(255, 43, 43, 0.12);
        }
        @media (max-width: 1040px) {
          .desktop-grid {
            grid-template-columns: 1fr !important;
            align-items: start !important;
          }
          .content-wrap {
            padding-top: 76px !important;
          }
          .fixed-main-width {
            width: auto !important;
          }
          .sidebar-card {
            width: 100% !important;
          }
          .input-main-grid,
          .analysis-main-grid,
          .lower-input-grid,
          .section-grid {
            grid-template-columns: 1fr !important;
          }
          .photo-card,
          .right-col {
            width: 100% !important;
          }
        }
        @media (max-width: 780px) {
          .age-grid,
          .tool-grid {
            grid-template-columns: 1fr !important;
          }
          .header-inner {
            height: auto !important;
            padding: 12px !important;
            grid-template-columns: 1fr !important;
            row-gap: 8px !important;
          }
        }
      `}</style>

      <div style={{ padding: 0 }}>
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 40,
            background: "transparent",
            paddingBottom: 8,
          }}
        >
          <div
            className="card-soft header-inner"
            style={{
              maxWidth: CARD_MAX,
              margin: "0 auto",
              height: 60,
              padding: "0 18px",
              display: "grid",
              gridTemplateColumns: "1fr auto",
              alignItems: "center",
              columnGap: 12,
              borderTopLeftRadius: 0,
              borderTopRightRadius: 0,
              background: "#47546c",
              border: "none",
              boxShadow: "0 10px 22px rgba(16,24,40,0.22)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#ffffff", lineHeight: 1 }}>
                BruiseTrace
              </div>
              <div style={{ fontSize: 9.8, color: "#79b8ff", fontWeight: 500 }}>
                Inclusive skin signal measurement system
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: 9.8, color: "#ffffff", fontWeight: 500 }}>Io Kim</div>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: "#d8ecff",
                  color: "#255cff",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="8.3" r="3.5" stroke="currentColor" strokeWidth="1.8" />
                  <path
                    d="M6.2 18.8C7.6 15.9 10 14.5 12 14.5C14 14.5 16.4 15.9 17.8 18.8"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            </div>
          </div>
        </div>

        <div className="content-wrap" style={{ maxWidth: CARD_MAX, margin: "0 auto", paddingTop: 80 }}>
          <div
            className="section-grid"
            style={{
              display: "grid",
              gridTemplateColumns: `${SIDEBAR_W}px ${MAIN_W}px`,
              gap: MAIN_GAP,
              alignItems: "start",
            }}
          >
            <aside className="sidebar-card">
              <div
                className="card-soft"
                style={{
                  padding: 10,
                  width: SIDEBAR_W,
                  minHeight: 740,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div
                  style={{
                    height: 32,
                    borderRadius: 10,
                    background: "#334158",
                    color: "#ffffff",
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    padding: "0 10px",
                    fontSize: 10.8,
                    fontWeight: 700,
                    marginBottom: 18,
                  }}
                >
                  <ListIcon />
                  Information
                </div>

                <div style={{ padding: "4px 6px 0 10px", display: "grid", gap: 18, flex: 1 }}>
                  <div
                    style={{
                      fontSize: 10.2,
                      fontWeight: 500,
                      color: infoTextColor(sidebarAgeDone),
                      lineHeight: 1.45,
                    }}
                  >
                    Estimated bruise age
                  </div>

                  <div style={{ display: "grid", gap: 10 }}>
                    <div
                      style={{
                        fontSize: 10.2,
                        fontWeight: 500,
                        color: infoTextColor(sidebarSelectionDone),
                        lineHeight: 1.45,
                      }}
                    >
                      Guided selection flow
                    </div>

                    <div style={{ display: "grid", gap: 7, paddingLeft: 4 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                          color: stepTextColor(sidebarUploadDone),
                          fontSize: 9.2,
                        }}
                      >
                        <ChevronIcon />
                        <span>Upload Photo</span>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                          color: stepTextColor(sidebarSelectionDone),
                          fontSize: 9.2,
                        }}
                      >
                        <ChevronIcon />
                        <span>Select the bruise</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ fontSize: 10.2, fontWeight: 500, color: "#1f2f46" }}>Analyze</div>
                </div>
              </div>
            </aside>

            <main className="fixed-main-width" style={{ width: MAIN_W, display: "grid", gap: 16 }}>
              <div className="card-soft" style={{ padding: "24px 24px" }}>
                <div
                  className="input-main-grid"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "170px 1fr",
                    columnGap: 14,
                    alignItems: "start",
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#344258" }}>
                    Estimated bruise age
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: "#344258" }}>
                      When did the bruise likely begin?
                    </div>
                    <div style={{ fontSize: 9.8, color: "#6f7d93", marginTop: 4 }}>
                      Helps interpret bruise color stages.
                    </div>

                    <div
                      className="age-grid"
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                        gap: 10,
                        marginTop: 18,
                      }}
                    >
                      {AGE_OPTIONS.map((item) => {
                        const active = bruiseAge === item.key;
                        const disabled = !hasImage;
                        return (
                          <button
                            key={item.key}
                            className={!disabled ? "hover-lift blue-hover" : ""}
                            onClick={() =>
                              !disabled &&
                              setBruiseAge((prev) => {
                                setResult(null);
                                return prev === item.key ? null : item.key;
                              })
                            }
                            disabled={disabled}
                            style={{
                              height: 36,
                              borderRadius: 8,
                              border: `1.5px solid ${active ? "#2d66ff" : "#d6dce7"}`,
                              background: active ? "#2d66ff" : "#ffffff",
                              color: active ? "#ffffff" : "#6a7485",
                              fontWeight: 600,
                              fontSize: 10.8,
                              cursor: disabled ? "default" : "pointer",
                              opacity: disabled ? 0.9 : 1,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              <div className="card-soft" style={{ padding: "24px 24px" }}>
                <div
                  className="input-main-grid"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "170px 1fr",
                    columnGap: 14,
                    alignItems: "start",
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#344258" }}>
                    Guided selection flow
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: "#344258" }}>
                      Select the bruise area using the brush (at least once).
                    </div>
                    <div style={{ fontSize: 9.8, color: "#6f7d93", marginTop: 4 }}>
                      You may add up to 3 selections (Tight, Balanced, Broad) to improve reliability.
                    </div>

                    <div
                      className="tool-grid"
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                        gap: 12,
                        marginTop: 18,
                        alignItems: "start",
                      }}
                    >
                      <div style={{ display: "grid", alignItems: "start" }}>
                        <button
                          className="hover-lift blue-hover"
                          onClick={() => fileInputRef.current?.click()}
                          style={{
                            width: "100%",
                            height: 34,
                            borderRadius: 10,
                            border: "2px solid #2d66ff",
                            background: hasImage ? "#2d66ff" : "#ffffff",
                            color: hasImage ? "#ffffff" : "#2d66ff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 7,
                            fontSize: 10.8,
                            fontWeight: 700,
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                        >
                          Upload Photo
                          <UploadIcon />
                        </button>
                        <div style={{ marginTop: 12 }}>
                          <input
                            type="range"
                            min="1"
                            max="2.5"
                            step="0.01"
                            value={zoom}
                            onChange={(e) => {
                              const nextZoom = Number(e.target.value);
                              setImgOffset((prev) =>
                                getZoomOffsetKeepingFrameCenter(zoom, nextZoom, prev, imgNaturalSize)
                              );
                              setZoom(nextZoom);
                            }}
                            disabled={!hasImage}
                            style={{ opacity: hasImage ? 1 : 0.5 }}
                          />
                        </div>
                      </div>

                      <div style={{ display: "grid", alignItems: "start" }}>
                        <button
                          className={hasImage ? "hover-lift blue-hover" : ""}
                          onClick={() => hasImage && setToolMode((prev) => (prev === "bruise" ? null : "bruise"))}
                          disabled={!hasImage}
                          style={{
                            width: "100%",
                            height: 34,
                            borderRadius: 10,
                            border: `1.5px solid ${toolMode === "bruise" ? "#2d66ff" : "#d6dce7"}`,
                            background: toolMode === "bruise" ? "#2d66ff" : "#ffffff",
                            color: toolMode === "bruise" ? "#ffffff" : "#6a7485",
                            fontSize: 10.8,
                            fontWeight: 700,
                            cursor: hasImage ? "pointer" : "default",
                            opacity: hasImage ? 1 : 0.9,
                            whiteSpace: "nowrap",
                          }}
                        >
                          Bruise Select Brush
                        </button>
                        <div style={{ marginTop: 12 }}>
                          <input
                            type="range"
                            min={BRUISE_BRUSH_MIN}
                            max={BRUISE_BRUSH_MAX}
                            step="1"
                            value={bruiseBrushSize}
                            onChange={(e) => setBruiseBrushSize(Number(e.target.value))}
                            disabled={!hasImage || toolMode !== "bruise"}
                            style={{ opacity: hasImage && toolMode === "bruise" ? 1 : 0.5 }}
                          />
                        </div>
                      </div>

                      <div style={{ display: "grid", alignItems: "start" }}>
                        <button
                          className={hasImage ? "hover-lift blue-hover" : ""}
                          onClick={() => hasImage && setToolMode((prev) => (prev === "erase" ? null : "erase"))}
                          disabled={!hasImage}
                          style={{
                            width: "100%",
                            height: 34,
                            borderRadius: 10,
                            border: `1.5px solid ${toolMode === "erase" ? "#2d66ff" : "#d6dce7"}`,
                            background: toolMode === "erase" ? "#2d66ff" : "#ffffff",
                            color: toolMode === "erase" ? "#ffffff" : "#6a7485",
                            fontSize: 10.8,
                            fontWeight: 700,
                            cursor: hasImage ? "pointer" : "default",
                            opacity: hasImage ? 1 : 0.9,
                            whiteSpace: "nowrap",
                          }}
                        >
                          Erase
                        </button>
                        <div style={{ marginTop: 12 }}>
                          <input
                            type="range"
                            min={ERASE_BRUSH_MIN}
                            max={ERASE_BRUSH_MAX}
                            step="1"
                            value={eraseBrushSize}
                            onChange={(e) => setEraseBrushSize(Number(e.target.value))}
                            disabled={!hasImage || toolMode !== "erase"}
                            style={{ opacity: hasImage && toolMode === "erase" ? 1 : 0.5 }}
                          />
                        </div>
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
                </div>
              </div>

              <div
                className="lower-input-grid"
                style={{
                  display: "grid",
                  gridTemplateColumns: `${LEFT_PHOTO_W}px ${RIGHT_COL_W}px`,
                  gap: MAIN_GAP,
                  alignItems: "start",
                }}
              >
                <div
                  className="card-soft photo-card"
                  style={{
                    width: LEFT_PHOTO_W,
                    padding: 0,
                    overflow: "hidden",
                    borderRadius: 16,
                    minHeight: 570,
                    position: "relative",
                    background:
                      image === null
                        ? "linear-gradient(0deg, rgba(45,102,255,0.05), rgba(45,102,255,0.05)), linear-gradient(90deg, rgba(45,102,255,0.09) 1px, transparent 1px), linear-gradient(rgba(45,102,255,0.09) 1px, transparent 1px)"
                        : "#f3f4f8",
                    backgroundSize:
                      image === null ? "100% 100%, 16px 16px, 16px 16px" : undefined,
                    border: image === null ? "2px dashed #8cc2ff" : "1px solid #e6e8f0",
                    userSelect: "none",
                    cursor: image && toolMode === null ? (draggingImage ? "grabbing" : "grab") : "default",
                  }}
                  onMouseDown={(e) => {
                    if (!image) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = ((e.clientX - rect.left) / rect.width) * FRAME_SIZE;
                    const y = ((e.clientY - rect.top) / rect.height) * FRAME_SIZE;

                    if (toolMode === null) {
                      startMove(e.clientX, e.clientY);
                    } else {
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
                    if (toolMode !== null && painting) drawBrush(x, y);
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

                      {showBrushCursor && (
                        <div
                          style={{
                            position: "absolute",
                            left: hoverPoint?.x ?? 0,
                            top: hoverPoint?.y ?? 0,
                            width: `${(previewRadius / FRAME_SIZE) * 100}%`,
                            height: `${(previewRadius / FRAME_SIZE) * 100}%`,
                            transform: "translate(-50%, -50%)",
                            borderRadius: "50%",
                            border:
                              toolMode === "bruise"
                                ? "2px solid rgba(45,102,255,0.85)"
                                : "2px solid rgba(80,92,110,0.85)",
                            background:
                              toolMode === "bruise" ? "rgba(45,102,255,0.03)" : "rgba(80,92,110,0.04)",
                            pointerEvents: "none",
                          }}
                        />
                      )}

                      <div
                        style={{
                          position: "absolute",
                          left: 14,
                          bottom: 14,
                          height: 30,
                          padding: "0 12px",
                          borderRadius: 999,
                          background: "rgba(107,79,55,0.82)",
                          color: "#ffffff",
                          display: "flex",
                          alignItems: "center",
                          fontSize: 10.8,
                          fontWeight: 500,
                        }}
                      >
                        {PASS_NAMES[currentPass]} ·{" "}
                        {toolMode === "bruise" ? "Bruise Brush" : toolMode === "erase" ? "Erase" : "Pan Image"}
                      </div>
                    </>
                  ) : (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "grid",
                        placeItems: "center",
                        fontSize: 16,
                        fontWeight: 500,
                        color: "#2d66ff",
                      }}
                    >
                      Bruise Photo
                    </div>
                  )}
                </div>

                <div
                  className="right-col"
                  style={{ width: RIGHT_COL_W, display: "grid", gap: 12, paddingBottom: 12 }}
                >
                  {PASS_NAMES.map((passName, idx) => {
                    const isSaved = !!savedSelections[idx];
                    const isCurrent = currentPass === idx;
                    const disabledPass = !hasImage;

                    return (
                      <div
                        key={passName}
                        className="card-soft"
                        onClick={() => {
                          if (!hasImage) return;
                          setCurrentPass(idx);
                          if (savedSelections[idx]) loadMaskToCanvas(savedSelections[idx]);
                          else clearMask();
                        }}
                        style={{
                          cursor: hasImage ? "pointer" : "default",
                          minHeight: 110,
                          padding: 16,
                          border:
                            isCurrent && !isSaved
                              ? "2px solid #2d66ff"
                              : isSaved
                              ? "1.5px solid #c8d8ff"
                              : "1px solid #e6e8f0",
                          background: isSaved ? "#EAF0FF" : "#ffffff",
                        }}
                      >
                        <div style={{ fontSize: 12.5, fontWeight: 800, color: "#344258" }}>{passName}</div>

                        {idx > 0 && (
                          <label
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              fontSize: 9.2,
                              color: "#6f7d93",
                              marginTop: 18,
                              opacity: hasImage ? 1 : 0.65,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={sameAsPrevious[idx]}
                              disabled={!hasImage}
                              onChange={(e) => {
                                const next = [...sameAsPrevious] as [boolean, boolean, boolean];
                                next[idx] = e.target.checked;
                                setSameAsPrevious(next);
                                if (e.target.checked && savedSelections[idx - 1]) {
                                  loadMaskToCanvas(savedSelections[idx - 1]);
                                } else if (!savedSelections[idx]) {
                                  clearMask();
                                }
                              }}
                            />
                            same as previous
                          </label>
                        )}

                        <div
                          style={{
                            display: "flex",
                            alignItems: "end",
                            justifyContent: "space-between",
                            gap: 8,
                            marginTop: idx === 0 ? 36 : 12,
                          }}
                        >
                          <div style={{ fontSize: 9.2, color: "#b1b9c6" }}>
                            {isSaved ? `${passName}: ${countMaskPixels(savedSelections[idx])} px` : ""}
                          </div>

                          <button
                            className={hasImage ? "hover-lift blue-hover" : ""}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!hasImage) return;
                              setCurrentPass(idx);

                              if (isSaved) {
                                clearPass(idx);
                                return;
                              }

                              savePass(idx);
                            }}
                            disabled={disabledPass}
                            style={{
                              width: 74,
                              height: 30,
                              borderRadius: 8,
                              border: `1.5px solid ${isSaved && hasImage ? "#2d66ff" : "#d6dce7"}`,
                              background: isSaved && hasImage ? "#2d66ff" : "#ffffff",
                              color: isSaved && hasImage ? "#ffffff" : "#3d4a5f",
                              fontSize: 10,
                              fontWeight: 700,
                              cursor: hasImage ? "pointer" : "default",
                              opacity: hasImage ? 1 : 0.9,
                            }}
                          >
                            {isSaved ? "Cancel" : "Save"}
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  <button
                    className={canAnalyze ? "hover-lift red-hover" : ""}
                    onClick={analyzeConsensus}
                    disabled={!canAnalyze}
                    style={{
                      width: "100%",
                      height: 42,
                      borderRadius: 10,
                      border: canAnalyze ? "0" : "2px solid #9ca5b3",
                      background: canAnalyze ? "linear-gradient(180deg, #ff2424 0%, #ff2020 100%)" : "#ffffff",
                      color: canAnalyze ? "#ffffff" : "#9ca5b3",
                      fontSize: 15,
                      fontWeight: 800,
                      cursor: canAnalyze ? "pointer" : "default",
                      boxShadow: canAnalyze ? "0 14px 24px rgba(255,34,34,0.16)" : "none",
                    }}
                  >
                    Analyze
                  </button>
                </div>
              </div>
            </main>
          </div>

          {result && (
            <div
              className="section-grid"
              style={{
                display: "grid",
                gridTemplateColumns: `${SIDEBAR_W}px ${MAIN_W}px`,
                gap: MAIN_GAP,
                alignItems: "start",
                marginTop: 12,
              }}
            >
              <aside className="sidebar-card">
                <div
                  className="card-soft"
                  style={{
                    padding: 10,
                    width: SIDEBAR_W,
                    minHeight: 520,
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <div
                    style={{
                      height: 32,
                      borderRadius: 10,
                      background: "#334158",
                      color: "#ffffff",
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      padding: "0 10px",
                      fontSize: 10.8,
                      fontWeight: 700,
                      marginBottom: 18,
                    }}
                  >
                    <AnalysisIcon />
                    Analysis
                  </div>

                  <div style={{ padding: "4px 6px 0 10px", display: "grid", gap: 18, flex: 1 }}>
                    <div style={{ fontSize: 10.2, fontWeight: 500, color: "#1f2f46" }}>
                      Healing interpretation
                    </div>
                    <div style={{ fontSize: 10.2, fontWeight: 500, color: "#1f2f46" }}>
                      Quantitative summary
                    </div>
                    <div style={{ fontSize: 10.2, fontWeight: 500, color: "#1f2f46" }}>
                      Bruise intensity
                    </div>
                    <div style={{ fontSize: 10.2, fontWeight: 500, color: "#1f2f46" }}>
                      Selection consistency
                    </div>
                  </div>
                </div>
              </aside>

              <div
                ref={resultSectionRef}
                className="analysis-main-grid"
                style={{
                  width: MAIN_W,
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) 280px",
                  gap: 12,
                  alignItems: "start",
                  scrollMarginTop: 82,
                }}
              >
                <div style={{ display: "grid", gap: 12 }}>
                  <div className="card-soft" style={{ padding: 18 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#1d2b44", marginBottom: 14 }}>
                      Healing interpretation
                    </div>

                    <div
                      style={{
                        border: "1.5px solid #39c987",
                        borderRadius: 12,
                        padding: "10px 64px 8px 12px",
                        position: "relative",
                        marginBottom: 28,
                        minHeight: 76,
                      }}
                    >
                      <div style={{ fontSize: 12.5, fontWeight: 800, color: "#334158" }}>Expected</div>
                      <div style={{ fontSize: 10, color: "#556378", marginTop: 6 }}>
                        Expected stage (from reported timing)
                      </div>
                      <div style={{ fontSize: 10, color: "#556378", marginTop: 3 }}>
                        {result.timingMode === "estimated"
                          ? "Start date unknown"
                          : `Typical healing stage for ${
                              AGE_OPTIONS.find((item) => item.key === bruiseAge)?.label ?? ""
                            }: ${result.expectedStageLabel ?? "—"}`}
                      </div>

                      <div
                        style={{
                          position: "absolute",
                          right: 12,
                          top: "50%",
                          transform: "translateY(-50%)",
                          width: 42,
                          height: 42,
                          borderRadius: "50%",
                          background: "#dff1e8",
                          display: "grid",
                          placeItems: "center",
                          fontSize: 8.5,
                          fontWeight: 700,
                          color: "#82a095",
                          textAlign: "center",
                          padding: 6,
                          lineHeight: 1.1,
                        }}
                      >
                        {result.expectedStageLabel ?? "N/A"}
                      </div>

                      {stageBarExpectedPosition !== null && (
                        <div
                          style={{
                            position: "absolute",
                            left: `calc(${stageBarExpectedPosition}% - 7px)`,
                            bottom: -14,
                            width: 0,
                            height: 0,
                            borderLeft: "7px solid transparent",
                            borderRight: "7px solid transparent",
                            borderTop: "20px solid #39c987",
                          }}
                        />
                      )}
                    </div>

                    <div style={{ position: "relative", margin: "0 0 28px 0" }}>
                      <div
                        style={{
                          position: "relative",
                          height: 48,
                          borderRadius: 20,
                          overflow: "hidden",
                          border: "2px solid #9ea6b4",
                          background:
                            "linear-gradient(90deg, #e50000 0%, #d70000 12%, #4b1f8e 28%, #4a215a 43%, #915317 61%, #efc66c 76%, #f1ead7 88%, #eeeeee 100%)",
                        }}
                      >
                        <div
                          style={{
                            position: "absolute",
                            inset: 0,
                            background:
                              "linear-gradient(90deg, transparent 0%, transparent 78%, rgba(255,255,255,0.22) 78%, rgba(255,255,255,0.22) 100%)",
                            maskImage:
                              "repeating-linear-gradient(135deg, transparent 0px, transparent 10px, black 10px, black 14px)",
                            WebkitMaskImage:
                              "repeating-linear-gradient(135deg, transparent 0px, transparent 10px, black 10px, black 14px)",
                            pointerEvents: "none",
                          }}
                        />

                        {[
                          { label: "S1", left: "8%" },
                          { label: "S2", left: "30%" },
                          { label: "S3", left: "52%" },
                          { label: "S4", left: "74%" },
                          { label: "S5", left: "91%" },
                        ].map((item) => (
                          <div
                            key={item.label}
                            style={{
                              position: "absolute",
                              left: item.left,
                              top: "50%",
                              transform: "translate(-50%, -50%)",
                              color: item.label === "S5" ? "#7a7a7a" : "#ffffff",
                              fontWeight: 800,
                              fontSize: 10.8,
                              letterSpacing: 0.1,
                            }}
                          >
                            {item.label}
                          </div>
                        ))}

                        {stageBarVisualPosition !== null && (
                          <div
                            style={{
                              position: "absolute",
                              left: `calc(${stageBarVisualPosition}% - 7px)`,
                              bottom: -18,
                              width: 0,
                              height: 0,
                              borderLeft: "7px solid transparent",
                              borderRight: "7px solid transparent",
                              borderBottom: "20px solid #ff7b27",
                            }}
                          />
                        )}
                      </div>
                    </div>

                    <div
                      style={{
                        border: "1.5px solid #ff8a53",
                        borderRadius: 12,
                        padding: "10px 64px 8px 12px",
                        position: "relative",
                        minHeight: 76,
                      }}
                    >
                      <div style={{ fontSize: 12.5, fontWeight: 800, color: "#334158" }}>Visual</div>
                      <div style={{ fontSize: 10, color: "#556378", marginTop: 6 }}>
                        Current visual stage (image-based)
                      </div>
                      <div style={{ fontSize: 10, color: "#556378", marginTop: 3 }}>
                        {result.stageSummaryLines[0]}
                      </div>

                      <div
                        style={{
                          position: "absolute",
                          right: 12,
                          top: "50%",
                          transform: "translateY(-50%)",
                          width: 42,
                          height: 42,
                          borderRadius: "50%",
                          background: "#f5e3d7",
                          display: "grid",
                          placeItems: "center",
                          fontSize: 8.5,
                          fontWeight: 700,
                          color: "#b08868",
                          textAlign: "center",
                          padding: 6,
                          lineHeight: 1.1,
                        }}
                      >
                        {result.stageLabel}
                      </div>
                    </div>

                    <div
                      style={{
                        marginTop: 12,
                        borderRadius: 14,
                        background: "#dfe7f7",
                        border: "2px solid #2d66ff",
                        padding: "14px 12px",
                        textAlign: "center",
                        boxShadow: "0 5px 0 #2d66ff",
                      }}
                    >
                      <div style={{ fontSize: 11.5, lineHeight: 1.6, fontWeight: 800, color: "#1f5df0" }}>
                        {result.alignmentHeadline}
                      </div>
                      <div style={{ marginTop: 8, fontSize: 10, color: "#46556e", lineHeight: 1.6 }}>
                        <div>{result.alignmentLines[0]}</div>
                        <div>{result.alignmentLines[1]}</div>
                      </div>
                    </div>
                  </div>

                  <div className="card-soft" style={{ padding: 18 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#1d2b44", marginBottom: 16 }}>
                      Quantitative summary
                    </div>

                    <div style={{ display: "grid", gap: 12, padding: "0 8px 4px" }}>
                      {result.stageConfidenceAll.map((item) => (
                        <div
                          key={item.key}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "48px 1fr 64px",
                            gap: 9,
                            alignItems: "center",
                          }}
                        >
                          <div style={{ fontSize: 10, color: "#5c697f" }}>{item.label}</div>
                          <div style={{ height: 8, background: "#d6dbe5", borderRadius: 999, overflow: "hidden" }}>
                            <div
                              style={{
                                width: `${Math.max(item.score * 100, 3)}%`,
                                height: "100%",
                                borderRadius: 999,
                                background: {
                                  red: "#ef2020",
                                  blue: "#2358ef",
                                  purple: "#8e22ef",
                                  brown: "#af6e3a",
                                  yellow: "#f0b72c",
                                }[item.key],
                              }}
                            />
                          </div>
                          <div style={{ fontSize: 9.2, color: "#8a95a5" }}>{formatScore(item.score)}</div>
                        </div>
                      ))}
                    </div>

                    <div
                      style={{
                        marginTop: 16,
                        borderRadius: 14,
                        background: "#dfe7f7",
                        border: "2px solid #2d66ff",
                        boxShadow: "0 5px 0 #2d66ff",
                        padding: "13px 12px 14px",
                      }}
                    >
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                        <div>
                          <div style={{ fontSize: 9.2, color: "#2d66ff", marginBottom: 6 }}>
                            Bruise intensity score
                          </div>
                          <div style={{ fontSize: 11.5, fontWeight: 800, color: "#2050d8" }}>
                            {formatScore(result.intensityScore)}
                          </div>
                          <div style={{ marginTop: 4, fontSize: 10, color: "#2050d8" }}>
                            {result.intensityLabel}
                          </div>
                        </div>

                        <div>
                          <div style={{ fontSize: 9.2, color: "#2d66ff", marginBottom: 6 }}>
                            Selection consistency score
                          </div>
                          <div style={{ fontSize: 11.5, fontWeight: 800, color: "#2050d8" }}>
                            {formatScore(result.consistencyScore)}
                          </div>
                          <div style={{ marginTop: 4, fontSize: 10, color: "#2050d8" }}>
                            {result.consistencyLabel}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ display: "grid", gap: 12 }}>
                  <div className="card-soft" style={{ padding: 18 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#1d2b44", marginBottom: 14 }}>
                      Bruise intensity
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                        gap: 12,
                        marginBottom: 12,
                      }}
                    >
                      {[
                        { label: "Moderate", fill: "#b8b8b8" },
                        { label: "Mild", fill: "#a9a9a9" },
                        { label: "Very Strong", fill: "#6d6d6d" },
                        { label: "Strong", fill: "#111111" },
                      ].map((item, idx) => {
                        const active = intensityOrder === idx;
                        return (
                          <div key={item.label} style={{ textAlign: "center" }}>
                            <div
                              style={{
                                width: 56,
                                height: 56,
                                borderRadius: "50%",
                                background: "#ededed",
                                margin: "0 auto 8px",
                                display: "grid",
                                placeItems: "center",
                              }}
                            >
                              <div
                                style={{
                                  width: 44,
                                  height: 44,
                                  borderRadius: "50%",
                                  background: "#d9d9d9",
                                  display: "grid",
                                  placeItems: "center",
                                }}
                              >
                                <div
                                  style={{
                                    width: 34,
                                    height: 34,
                                    borderRadius: "50%",
                                    background: item.fill,
                                  }}
                                />
                              </div>
                            </div>

                            <div
                              style={{
                                minHeight: 26,
                                borderRadius: 13,
                                border: active ? "1.8px solid #ff4b1f" : "1.4px solid #d9dee7",
                                color: active ? "#334158" : "#9aa3b1",
                                fontSize: 9.2,
                                fontWeight: 500,
                                display: "grid",
                                placeItems: "center",
                                padding: "0 6px",
                              }}
                            >
                              {item.label}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div
                      style={{
                        borderRadius: 14,
                        background: "#dfe7f7",
                        border: "2px solid #2d66ff",
                        boxShadow: "0 5px 0 #2d66ff",
                        padding: "14px 12px",
                        textAlign: "center",
                        color: "#1f5df0",
                        fontSize: 11.5,
                        fontWeight: 800,
                        lineHeight: 1.7,
                      }}
                    >
                      <div>{result.intensityLines[0]}</div>
                      <div>{result.intensityLines[1]}</div>
                    </div>
                  </div>

                  <div className="card-soft" style={{ padding: 0, overflow: "hidden" }}>
                    <div style={{ padding: 18 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: "#1d2b44", marginBottom: 14 }}>
                        Selection consistency
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                          gap: 10,
                          marginBottom: 14,
                        }}
                      >
                        {["Low", "Moderate", "High"].map((label, idx) => {
                          const active = consistencyIndex === idx;
                          const innerScale = idx === 0 ? 0.64 : idx === 1 ? 0.82 : 0.95;
                          return (
                            <div key={label} style={{ textAlign: "center" }}>
                              <div
                                style={{
                                  width: 50,
                                  height: 50,
                                  borderRadius: "50%",
                                  background: "#efcd7b",
                                  margin: "0 auto 8px",
                                  position: "relative",
                                }}
                              >
                                <div
                                  style={{
                                    position: "absolute",
                                    inset: 4,
                                    borderRadius: "50%",
                                    background: "#87c5ea",
                                  }}
                                />
                                <div
                                  style={{
                                    position: "absolute",
                                    left: "50%",
                                    top: "50%",
                                    width: 50 * innerScale,
                                    height: 50 * innerScale,
                                    transform: "translate(-50%, -50%)",
                                    borderRadius: "50%",
                                    background: "#7778df",
                                  }}
                                />
                              </div>

                              <div
                                style={{
                                  height: 24,
                                  borderRadius: 12,
                                  border: active ? "1.8px solid #ff4b1f" : "1.4px solid #d9dee7",
                                  color: active ? "#334158" : "#9aa3b1",
                                  fontSize: 9.2,
                                  fontWeight: 500,
                                  display: "grid",
                                  placeItems: "center",
                                  padding: "0 4px",
                                }}
                              >
                                {label}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div
                      style={{
                        margin: "0 0 5px 0",
                        borderRadius: 14,
                        background: "#dfe7f7",
                        borderTop: "2px solid #2d66ff",
                        borderLeft: "2px solid #2d66ff",
                        borderRight: "2px solid #2d66ff",
                        borderBottom: "5px solid #2d66ff",
                        padding: "14px 12px",
                        textAlign: "center",
                        color: "#1f5df0",
                        fontSize: 11.5,
                        fontWeight: 800,
                        lineHeight: 1.7,
                      }}
                    >
                      <div>{result.consistencyMeaningLines[0]}</div>
                      <div>{result.consistencyMeaningLines[1]}</div>
                    </div>
                  </div>

                  <div className="card-soft" style={{ padding: 14 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 10,
                      }}
                    >
                      <div style={{ fontSize: 12.5, fontWeight: 800, color: "#1d2b44" }}>
                        Analysis note
                      </div>
                      <div style={{ color: "#99a4b4" }}>
                        <InfoIcon />
                      </div>
                    </div>

                    <div style={{ fontSize: 10, color: "#6f7d93", lineHeight: 1.7 }}>
                      This tool provides an image-based interpretation only and does not diagnose a medical
                      condition. Lighting, skin tone, camera quality, and selection choices can affect the
                      result. Repeat photos taken 24 hours or more apart are more useful for recovery
                      tracking.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <canvas ref={roiCanvasRef} width={FRAME_SIZE} height={FRAME_SIZE} style={{ display: "none" }} />
      </div>
    </>
  );
}