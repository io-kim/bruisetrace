# BruiseTrace

**Inclusive skin signal measurement system for bruise analysis**

BruiseTrace is a web-based tool designed to analyze bruise color stages, intensity, and healing progression using a user-guided selection approach.  
It emphasizes **inclusive skin representation**, **visual interpretability**, and **human-in-the-loop analysis**.

---

## 🧠 Core Concept

- Users manually select the bruise region using a **brush-based interface**
- Multiple passes (Tight / Balanced / Broad) improve reliability
- The system analyzes:
  - Color stage (Red → Blue → Purple → Brown → Yellow → Resolved)
  - Bruise intensity
  - Selection consistency
- Results are interpreted rather than shown as raw data only

---

## ⚙️ Key Features

- 🖌️ Guided ROI selection (3-pass system)
- 🎨 Color stage classification (HSV-based)
- 📊 Bruise intensity estimation
- 📐 Selection consistency scoring
- 📉 Healing interpretation vs expected timeline
- 🧩 Human-centered UX (not fully automated AI)

---

## 📸 Example Analysis Results

### 1. Guided Selection (User Interaction)
![Info Flow](/screenshots/info_flow.png)

Users manually select the bruise region using a brush-based interface.  
Multiple passes can be used to improve selection reliability.

---

### 2. Very Strong Intensity (Dense Dark Core)
![Very Strong](/screenshots/analysis_very_strong.png)

A dense dark core with high local contrast leads to a **Very Strong** intensity classification.  
The visual stage (Purple) is close to the expected healing stage.

---

### 3. Strong Intensity (Brown Dominant Stage)
![Strong Brown](/screenshots/analysis_strong_brown.png)

The bruise shows a strong brown dominance, indicating progression into a later healing phase.  
The system interprets this as **Strong intensity** with consistent selection overlap.

---

### 4. Stage Mismatch Detection (Red vs Expected Blue)
![Mismatch](/screenshots/analysis_mismatch_red.png)

The visual stage appears **earlier than expected** (Red vs expected Blue).  
This suggests slower healing progression based on reported timing.

---

### 5. Transition Stage (Purple → Brown)
![Transition](/screenshots/analysis_transition.png)

Mixed color signals (Purple with Brown transition) indicate an ongoing healing shift.  
The model captures this transition rather than forcing a single-stage classification.

---

## 🚀 Tech Stack

- Next.js (App Router)
- TypeScript
- Canvas-based image processing
- Client-side analysis (no backend dependency)

---

## 📌 Version

**v0.6**

- Improved bruise intensity model
- Improved summary interpretation
- Stabilized analysis pipeline
- Added README visual documentation

---

## 🧭 Roadmap

- v0.7 → ROI segmentation improvement
- v0.8 → recovery tracking
- v1.0 → research-grade release

---

## 🌐 Live Demo

https://bruisetrace.vercel.app
