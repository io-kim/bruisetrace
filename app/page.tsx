"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const DESKTOP_OUTER_WIDTH = 940;
const DESKTOP_INNER_WIDTH = 904;
const COL1 = 188;
const GAP12 = 15;
const COL2 = 500;
const GAP23 = 11;
const COL3 = 190;
const HEADER_HEIGHT = 50;
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

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const photoBoxRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const panningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, startX: 0, startY: 0 });

  const masksRef = useRef<Record<PassKey, Uint8Array>>({
    1: createEmptyMask(),
    2: createEmptyMask(),
    3: createEmptyMask(),
  });

  const ageOptions = ["Unknown", "Within 24h", "1-2 days", "3-4 days", "5-7 days", "8-10 days", "11-13 days", "14+ days"];

  const activeSliderValue = selectedTool === "erase" ? eraseSlider : selectedTool === "brush" ? brushSlider : uploadSlider;
  const brushRadius = useMemo(() => 8 + (activeSliderValue / 100) * 28, [activeSliderValue]);

  useEffect(() => {
    setDisplayScale(1 + (uploadSlider / 100) * 0.8);
  }, [uploadSlider]);

  const passEnabled = (pass: PassKey) => (pass === 1 ? true : pass === 2 ? savedPasses[1] : savedPasses[2]);
  const nextAvailablePass: PassKey = savedPasses[1] ? (savedPasses[2] ? 3 : 2) : 1;
  const guidedDone = Boolean(imageSrc) && Boolean(maskCounts[1] > 0 || savedPasses[1] || selectedTool === "brush");
  const [bruiseAge, setBruiseAge] = useState<string | null>(null);
  const hasSavedPass = savedPasses[1] || savedPasses[2] || savedPasses[3];
  const analyzeReady = Boolean(selectedAge) && hasSavedPass;
  const uploadControlActive = Boolean(imageSrc) && selectedTool !== "brush" && selectedTool !== "erase";

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
        :root{--bg:#f4f5f9;--card:#fbfbfc;--line:#e7e9ef;--header:#3f4c66;--header-accent:#8eb4ff;--navy:#3f4c66;--blue:#2d66ff;--text:#1f1f1f;--shadow-btn:0 3px 8px rgba(52,74,99,.12)}
        *{box-sizing:border-box}
        html,body{margin:0;padding:0;background:var(--bg);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--text)}
        button,input{font:inherit}
        input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:10px;border-radius:999px;background:#d9e0ea;outline:none;margin:0}
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:22px;height:22px;border-radius:999px;border:0;background:#6a7d9a;box-shadow:0 2px 4px rgba(40,48,67,.2)}
        input[type=range]::-moz-range-thumb{width:22px;height:22px;border-radius:999px;border:0;background:#6a7d9a;box-shadow:0 2px 4px rgba(40,48,67,.2)}
        .page{min-height:100vh;background:var(--bg)}
        .header-shell{position:sticky;top:0;z-index:50;width:100%;background:var(--header)}
        .header-inner{width:100%;max-width:${DESKTOP_OUTER_WIDTH}px;height:${HEADER_HEIGHT}px;margin:0 auto;padding:0 18px;display:flex;align-items:center;justify-content:space-between}
        .header-left{display:flex;align-items:center;gap:28px;min-width:0}
        .brand{font-size:22px;font-weight:800;color:#fff;line-height:1;white-space:nowrap}
        .tagline{font-size:10px;color:var(--header-accent);line-height:1.1;white-space:nowrap}
        .header-right{display:flex;align-items:center;gap:12px;color:#fff}
        .username{font-size:10px;line-height:1;white-space:nowrap}
        .avatar{width:32px;height:32px;border-radius:999px;background:#eff4fb;color:#8b25ff;display:grid;place-items:center;flex:0 0 auto}
        .desktop-shell{width:${DESKTOP_OUTER_WIDTH}px;margin:0 auto;padding:14px 18px 20px}
        .desktop-inner{width:${DESKTOP_INNER_WIDTH}px;display:grid;row-gap:11px}
        .layout-row{width:${DESKTOP_INNER_WIDTH}px;display:grid;grid-template-columns:${COL1}px ${GAP12}px ${COL2}px ${GAP23}px ${COL3}px;align-items:start}
        .col1{grid-column:1}
        .col23{grid-column:3 / 6;width:${COL2 + GAP23 + COL3}px;display:grid;row-gap:11px}
        .sidebar{width:${COL1}px;background:transparent}
        .side-nav{display:grid;gap:24px;margin-top:6px;margin-bottom:54px}
        .nav-btn{width:148px;height:38px;margin-left:20px;border-radius:12px;border:1px solid #495a79;background:#fff;color:#3d4a60;box-shadow:var(--shadow-btn);font-size:17px;font-weight:700;cursor:pointer}
        .nav-btn.active{background:var(--navy);color:#fff;box-shadow:0 0 0 1.5px rgba(89,129,255,.22),var(--shadow-btn)}
        .nav-btn.nav-btn-disabled{opacity:1;cursor:not-allowed}
        .nav-btn.nav-btn-disabled:hover{box-shadow:var(--shadow-btn)}
        .sidebar-outline{width:${COL1}px;padding:0 10px 0 28px;display:grid;gap:42px}
        .side-title{margin:0;font-size:12px;line-height:1.2;font-weight:700;color:#202020}
        .side-title.active,.side-step.active{color:var(--blue)}
        .side-step-group{display:grid;gap:18px}
        .side-steps{display:grid;gap:16px;padding-left:24px}
        .side-step{margin:0;font-size:10px;line-height:1.25;font-weight:600;color:#222}
        .card{background:var(--card);border-radius:16px;box-shadow:inset 0 0 0 1px var(--line)}
        .top-card{width:${COL2 + GAP23 + COL3}px;min-height:210px;padding:18px 24px 22px}
        .top-card-grid{display:grid;grid-template-columns:1fr 1fr;column-gap:12px;align-items:start}
        .section-title{margin:0;font-size:16px;line-height:1.1;font-weight:800;color:#202020}
        .copy-block{display:grid;justify-items:end}
        .control-max-width{width:430px;display:grid;justify-items:end}
        .copy-title{margin:0;font-size:15px;line-height:1.25;font-weight:800;color:#222;text-align:right}
        .copy-sub{margin:4px 0 0 0;font-size:14px;line-height:1.25;color:#2f2f2f;text-align:right}
        .age-grid{width:430px;margin-top:62px;display:grid;grid-template-columns:repeat(4,100px);justify-content:start;gap:10px}
        .age-btn{width:100px;height:32px;border-radius:10px;border:1px solid #bebebe;background:#fff;color:#747474;font-size:10px;font-weight:500;cursor:pointer}
        .age-btn:hover{box-shadow:var(--shadow-btn)}
        .age-btn.active{background:var(--blue);border:1.5px solid var(--blue);color:#fff;box-shadow:var(--shadow-btn)}
        .guided-controls{width:430px;margin-top:62px;display:grid;grid-template-columns:repeat(3,137px);justify-content:start;gap:10px}
        .guided-col{display:grid;gap:12px}
        .tool-btn{width:137px;height:32px;border-radius:10px;border:1px solid #bebebe;background:#fff;color:#747474;font-size:10px;font-weight:500;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px}
        .tool-btn:hover{box-shadow:var(--shadow-btn)}
        .tool-btn.upload{border-color:var(--blue);color:var(--blue);font-weight:700}
        .tool-btn.active{background:var(--blue);border:1.5px solid var(--blue);color:#fff;box-shadow:var(--shadow-btn)}
        .tool-btn.brush-active{background:#fff;color:#5d6675;border:1.5px solid var(--blue);box-shadow:var(--shadow-btn)}
        .lower-grid{width:${COL2 + GAP23 + COL3}px;display:grid;grid-template-columns:${COL2}px ${GAP23}px ${COL3}px;align-items:start}
        .photo-box{width:${PHOTO_SIZE}px;height:${PHOTO_SIZE}px;border-radius:0;position:relative;overflow:hidden;border:2px dashed #8bb8ff;background:linear-gradient(0deg,rgba(45,102,255,.02),rgba(45,102,255,.02)),linear-gradient(90deg,rgba(45,102,255,.08) 1px,transparent 1px),linear-gradient(rgba(45,102,255,.08) 1px,transparent 1px);background-size:100% 100%,18px 18px,18px 18px;user-select:none;touch-action:none}
        .image-stage{position:absolute;inset:0;overflow:hidden}
        .photo-image{position:absolute;left:50%;top:50%;width:100%;height:100%;object-fit:contain;transform-origin:center center;-webkit-user-drag:none;user-select:none;pointer-events:none}
        .draw-canvas{position:absolute;inset:0;width:100%;height:100%;z-index:2;pointer-events:none}
        .photo-placeholder{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;color:var(--blue);pointer-events:none;z-index:1}
        .photo-placeholder-inner{display:flex;flex-direction:column;align-items:center;justify-content:center}
        .photo-label{margin-top:10px;font-size:20px;line-height:1.1;font-weight:700}
        .brush-cursor{position:absolute;border-radius:999px;border:2px solid #2d66ff;box-shadow:0 0 0 1px rgba(255,255,255,.95);background:rgba(45,102,255,.1);pointer-events:none;transform:translate(-50%,-50%);z-index:3}
        .erase-cursor{border-color:#ff5b5b;background:rgba(255,91,91,.1)}
        .pass-col{width:${COL3}px;height:${PHOTO_SIZE}px;display:grid;grid-template-rows:${PASS_CARD_HEIGHT}px ${PASS_CARD_HEIGHT}px ${PASS_CARD_HEIGHT}px ${ANALYZE_HEIGHT}px;row-gap:10px}
        .pass-card{width:${COL3}px;height:${PASS_CARD_HEIGHT}px;padding:16px 14px 14px;border-radius:12px;background:var(--card);box-shadow:inset 0 0 0 1px var(--line);display:grid;grid-template-rows:auto 1fr auto auto;gap:10px;cursor:pointer}
        .pass-card:hover{box-shadow:inset 0 0 0 1px var(--line),var(--shadow-btn)}
        .pass-card.current-only{background:var(--card);box-shadow:inset 0 0 0 1.5px var(--blue)}
        .pass-card.active{background:#eef4ff;box-shadow:inset 0 0 0 1.5px #89a9ff}
        .pass-card.disabled{opacity:1;cursor:not-allowed}
        .pass-title{margin:0;font-size:16px;line-height:1;font-weight:800;color:#151515;text-align:right}
        .pass-row{display:flex;justify-content:flex-end;align-items:center;gap:8px;font-size:10px;line-height:1.2;font-weight:700;color:#1f1f1f}
        .pass-row input{width:16px;height:16px;margin:0}
        .pass-meta{margin:0;min-height:12px;font-size:10px;line-height:1.25;color:#2d2d2d;text-align:right}
        .pass-btn{width:95px;height:32px;justify-self:end;border-radius:10px;border:1px solid #bebebe;background:#fff;color:#7b7b7b;font-size:10px;line-height:1;font-weight:500;cursor:pointer}
        .pass-btn:hover:not(:disabled){box-shadow:var(--shadow-btn)}
        .pass-btn.active{background:var(--blue);border:1.5px solid var(--blue);color:#fff;box-shadow:var(--shadow-btn)}
        .pass-btn:disabled{opacity:.45;cursor:not-allowed}
        .analyze-btn{width:${COL3}px;height:${ANALYZE_HEIGHT}px;border-radius:10px;border:1px solid #ff4343;background:#fff;color:#ff4343;font-size:16px;line-height:1;font-weight:700;cursor:default}px;height:${ANALYZE_HEIGHT}px;border-radius:10px;border:1px solid #ff4343;background:#fff;color:#ff4343;font-size:20px;line-height:1;font-weight:600;cursor:default}px;height:${ANALYZE_HEIGHT}px;border-radius:10px;border:1px solid #ff4343;background:#fff;color:#ff4343;font-size:10px;line-height:1;font-weight:700;cursor:default}
        .analyze-btn:hover:not(:disabled){box-shadow:var(--shadow-btn)}
        .analyze-btn.outlined{border:1px solid #ff4343;background:#fff;color:#ff4343;box-shadow:var(--shadow-btn);cursor:pointer}
        .analyze-btn.active{font-size:16px;font-weight:700;background:#ff3131;border:1.5px solid #ff3131;color:#fff;box-shadow:var(--shadow-btn);cursor:pointer}
        input[type=range]:disabled{opacity:.45}
        .alert-overlay{position:fixed;inset:0;background:rgba(18,24,38,.22);display:flex;align-items:center;justify-content:center;z-index:200}.alert-modal{width:360px;max-width:calc(100vw - 32px);background:#fff;border-radius:16px;box-shadow:0 18px 36px rgba(25,35,58,.18);padding:22px 22px 18px;text-align:center}.alert-message{margin:0;font-size:13px;line-height:1.45;font-weight:500;color:#232a38}.alert-actions{margin-top:14px;display:flex;justify-content:center}.alert-ok{min-width:82px;height:34px;border-radius:10px;border:1px solid #2d66ff;background:#2d66ff;color:#fff;font-size:12px;font-weight:600;cursor:pointer;box-shadow:var(--shadow-btn)}.mobile-fallback{display:none}
        @media (max-width:1199px){.desktop-shell{display:none}.mobile-fallback{display:grid;place-items:center;min-height:calc(100vh - ${HEADER_HEIGHT}px);padding:24px;text-align:center;color:#4a5568}.mobile-fallback-card{max-width:420px;background:#fff;border-radius:16px;padding:24px;box-shadow:0 10px 24px rgba(45,58,86,.08)}}
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
            setImageOffset({ x: 0, y: 0 });
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext("2d");
            ctx?.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
          }}
        />

        <main className="desktop-shell">
          <div className="desktop-inner">
            <section className="layout-row">
              <aside className="col1">
                <div className="sidebar">
                  <div className="side-nav">
                    <button className={`nav-btn ${activeNav === "home" ? "active" : ""}`} onClick={() => setActiveNav("home")}>Home</button>
                    <button className={`nav-btn ${activeNav === "information" ? "active" : ""}`} onClick={() => setActiveNav("information")}>Information</button>
                    <button
                      className={`nav-btn ${activeNav === "analysis" ? "active" : ""} ${!analysisViewed ? "nav-btn-disabled" : ""}`}
                      onClick={() => {
                        if (!analysisViewed) return;
                        setActiveNav("analysis");
                      }}
                    >
                      Analysis
                    </button>
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
              </aside>

              <div className="col23">
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
                            <button
                              className={`tool-btn upload ${uploadControlActive ? "active" : ""}`}
                              onClick={() => { if(analyzeReady){ setIsAnalyzed(true); }
                                if (selectedTool === "brush" || selectedTool === "erase") {
                                  setSelectedTool(null);
                                  return;
                                }
                                fileInputRef.current?.click();
                              }}
                            >
                              Upload Photo
                              <UploadIcon />
                            </button>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              value={uploadSlider}
                              disabled={!uploadControlActive}
                              onChange={(e) => setUploadSlider(Number(e.target.value))}
                            />
                          </div>
                          <div className="guided-col">
                            <button
                              className={`tool-btn ${selectedTool === "brush" ? "active" : ""}`}
                              onClick={() => setSelectedTool((prev) => (prev === "brush" ? null : "brush"))}
                            >
                              Bruise Select Brush
                            </button>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              value={brushSlider}
                              disabled={selectedTool !== "brush"}
                              onChange={(e) => setBrushSlider(Number(e.target.value))}
                            />
                          </div>
                          <div className="guided-col">
                            <button
                              className={`tool-btn ${selectedTool === "erase" ? "active" : ""}`}
                              onClick={() => setSelectedTool((prev) => (prev === "erase" ? null : "erase"))}
                            >
                              Erase
                            </button>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              value={eraseSlider}
                              disabled={selectedTool !== "erase"}
                              onChange={(e) => setEraseSlider(Number(e.target.value))}
                            />
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
                    onDragStart={(e) => {
                      e.preventDefault();
                    }}
                    onMouseUp={() => {
                      drawingRef.current = false;
                      panningRef.current = false;
                    }}
                  >
                    <div className="image-stage">
                      {imageSrc ? (
                        <>
                          <img
                            src={imageSrc}
                            alt="Bruise upload"
                            className="photo-image"
                            style={{ transform: `translate(calc(-50% + ${imageOffset.x}px), calc(-50% + ${imageOffset.y}px)) scale(${displayScale})` }}
                          />
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
                          onClick={() => { if(analyzeReady){ setIsAnalyzed(true); }
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

                          <p className="pass-meta">
                            {labelCount > 0 ? `Pass ${typedPass}: ${labelCount} px` : typedPass > 1 ? `Pass ${typedPass - 1}: ${maskCounts[(typedPass - 1) as PassKey]} px` : ""}
                          </p>

                          <button
                            className={`pass-btn ${isSaved ? "active" : ""}`}
                            disabled={!isSaved && !canSave}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSavePass(typedPass);
                            }}
                          >
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
                        setAnalysisViewed(true);
                        setActiveNav("analysis");
                      }}
                    >
                      Analyze
                    </button>
                  </div>
                </div>
              </div>
            </section>
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
          <div className="mobile-fallback-card">Desktop layout only</div>
        </div>
      </div>
    </>
  );
}
