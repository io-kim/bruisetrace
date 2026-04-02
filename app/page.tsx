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

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const photoBoxRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const informationRef = useRef<HTMLDivElement | null>(null);
  const analysisRef = useRef<HTMLDivElement | null>(null);

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
        .analysis-shell{width:${DESKTOP_INNER_WIDTH}px;padding-top:10px}
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
        .healing-stage-card.expected{height:65px;box-shadow:inset 0 0 0 1px #33c45a}
        .healing-stage-card.visual{height:80px;box-shadow:inset 0 0 0 1px #ff8d28}
        .healing-stage-inner{height:100%;padding:13px 10px;display:flex;align-items:center;justify-content:space-between;gap:14px}
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
        .healing-stagebar{position:relative;width:100%;height:29px;border-radius:999px;overflow:hidden;background-image:url("data:image/png;base64,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");background-size:100% 100%;background-repeat:no-repeat;background-position:center}
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
                      onClick={() => {
                        if (!hasSavedPass) return;
                        if (!selectedAge) {
                          setShowAgeAlert(true);
                          return;
                        }
                        setSelectedTool(null);
                        clearOverlay();
                        setActiveNav("analysis");
                        setAnalysisViewed(true);
                      }}
                    >
                      Analyze
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
                            <p className="healing-stage-line">Typical healing stage for 8–10 days: Blue</p>
                          </div>
                          <div className="healing-stage-badge expected">Yellow</div>
                        </div>
                        <div className="healing-pointer expected" />
                      </div>

                      <div className="healing-stagebar-wrap">
                        <div className="healing-stagebar">

                        </div>
                      </div>

                      <div className="healing-stage-card visual">
                        <div className="healing-pointer visual" />
                        <div className="healing-stage-inner">
                          <div className="healing-stage-copy">
                            <p className="healing-stage-title">Visual</p>
                            <p className="healing-stage-line">Current visual stage (image-based)</p>
                            <p className="healing-stage-line">The image most closely matches the Yellow stage.</p>
                          </div>
                          <div className="healing-stage-badge visual">Red</div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="analysis-blue-card">
                    <div className="analysis-blue-pad26">
                      <p className="analysis-blue-text analysis-blue-center">
                        Healing appears slightly slower than expected. The current visual stage looks somewhat earlier than the expected Yellow stage for the reported timing. This suggests somewhat slower visible recovery than expected.
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
                        <div className="quant-bar"><div className="quant-fill" style={{ width: "88px", background: "#f41616" }} /></div>
                        <p className="quant-score">0.00 / 1.00</p>
                      </div>
                      <div className="quant-row">
                        <p className="quant-label">Blue</p>
                        <div className="quant-bar"><div className="quant-fill" style={{ width: "88px", background: "#2450db" }} /></div>
                        <p className="quant-score">0.00 / 1.00</p>
                      </div>
                      <div className="quant-row">
                        <p className="quant-label">Purple</p>
                        <div className="quant-bar"><div className="quant-fill" style={{ width: "88px", background: "#8f17df" }} /></div>
                        <p className="quant-score">0.00 / 1.00</p>
                      </div>
                      <div className="quant-row">
                        <p className="quant-label">Brown</p>
                        <div className="quant-bar"><div className="quant-fill" style={{ width: "88px", background: "#b26b3b" }} /></div>
                        <p className="quant-score">0.00 / 1.00</p>
                      </div>
                      <div className="quant-row">
                        <p className="quant-label">Yellow</p>
                        <div className="quant-bar"><div className="quant-fill" style={{ width: "88px", background: "#f4bf3a" }} /></div>
                        <p className="quant-score">0.00 / 1.00</p>
                      </div>
                    </div>
                  </div>
                  <div className="analysis-blue-card">
                    <div className="analysis-blue-pad26">
                      <div className="analysis-blue-score-grid">
                        <div>
                          <p className="analysis-blue-score-label">Bruise intensity score</p>
                          <p className="analysis-blue-score-value">0.74 / 1.00</p>
                          <p className="analysis-blue-score-meta">Strong</p>
                        </div>
                        <div>
                          <p className="analysis-blue-score-label">Selection consistency score</p>
                          <p className="analysis-blue-score-value">0.36 / 1.00</p>
                          <p className="analysis-blue-score-meta">Low</p>
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
                        <div className="intensity-circle-item"><div className="intensity-pill">Moderate</div></div>
                        <div className="intensity-circle-item"><div className="intensity-pill">Mild</div></div>
                        <div className="intensity-circle-item"><div className="intensity-pill active">Strong</div></div>
                        <div className="intensity-circle-item"><div className="intensity-pill">Very Strong</div></div>
                      </div>
                    </div>
                  </div>
                  <div className="analysis-blue-card">
                    <div className="analysis-blue-pad26">
                      <p className="analysis-blue-text analysis-blue-center">
                        The selected bruise core appears noticeably dark overall. The overall intensity is interpreted as Strong.
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
                        <div className="consistency-pill low">Low</div>
                        <div className="consistency-pill moderate active">Moderate</div>
                        <div className="consistency-pill high">High</div>
                      </div>
                    </div>
                  </div>
                  <div className="analysis-blue-card">
                    <div className="analysis-blue-pad26">
                      <p className="analysis-blue-text analysis-blue-center">
                        This reflects how similar your bruise boundary selections were across repeated passes. A low result suggests the selected boundary was harder to reproduce consistently.
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
