# BruiseTrace

Inclusive skin signal measurement system for bruise analysis

BruiseTrace is a web-based tool designed to analyze bruise color stages, intensity, and healing progression using a user-guided selection approach.  
It emphasizes inclusive skin representation, visual interpretability, and human-in-the-loop analysis.

---

## Core Concept

- Users manually select the bruise region using a brush-based interface
- Multiple passes (Tight / Balanced / Broad) improve reliability
- The system analyzes:
  - Color stage (Red → Blue → Purple → Brown → Yellow → Resolved)
  - Bruise intensity
  - Selection consistency

---

## Key Features

- Guided ROI selection (3-pass system)
- Color stage classification (HSV-based)
- Bruise intensity estimation
- Selection consistency scoring
- Healing interpretation vs expected timeline

---

## Example Analysis Results

### 1. Guided Selection
![Info Flow](https://raw.githubusercontent.com/io-kim/bruisetrace/main/public/screenshots/info_flow.png)

### 2. Very Strong Intensity
![Very Strong](https://raw.githubusercontent.com/io-kim/bruisetrace/main/public/screenshots/analysis_very_strong.png)

### 3. Strong Brown Stage
![Strong Brown](https://raw.githubusercontent.com/io-kim/bruisetrace/main/public/screenshots/analysis_strong_brown.png)

### 4. Stage Mismatch
![Mismatch](https://raw.githubusercontent.com/io-kim/bruisetrace/main/public/screenshots/analysis_mismatch_red.png)

### 5. Transition Stage
![Transition](https://raw.githubusercontent.com/io-kim/bruisetrace/main/public/screenshots/analysis_transition.png)

---

## Tech Stack

- Next.js
- TypeScript
- Canvas API

---

## Version

v0.6

---

## Live Demo

https://bruisetrace.vercel.app
