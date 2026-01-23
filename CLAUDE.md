# Claude Code Instructions

## Setup & Run

1. Unzip this project
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Open http://localhost:3000 in the browser

## Project Overview

This is a Next.js 14 financial model builder with two main pages:

- `/glassinputs` - Time series input definition (flags, indexations, values)
- `/model-builder` - Formula-based calculations with dependency tracking

## Key Files

- `app/glassinputs/page.jsx` - Input arrays page
- `app/model-builder/page.jsx` - Calculations page with formula editor
- `utils/formulaEngine.js` - Formula parsing and evaluation
- `utils/moduleTemplates.js` - Preset modules (debt, depreciation, etc.)

## Tech Stack

- Next.js 14 (App Router)
- React 18
- Tailwind CSS
- Lucide React icons

## Code Guidelines

- **Aim to keep files under ~1000 lines** - Not a hard limit, but if files are getting large, consider going back to planning mode to restructure into smaller, well-organized modules

## Data Files

**Use these files for model state (NOT glass-inputs-autosave.json):**
- `data/model-inputs.json` - Input values and groups
- `data/model-calculations.json` - Formulas and calculation structure
- `data/model-ui-state.json` - UI preferences
- `data/model-links.json` - References between items

**NEVER search or read `data/glass-inputs-autosave.json`** - it's too large and outdated.

## Formula Reference System

**R-references resolve by calculation ID, not array position.**

When writing formulas that reference other calculations:
- `R60` references the calculation with `"id": 60`
- Array position is irrelevant for formula resolution
- Inserting/reordering calculations does NOT break references

Example: A calculation with `"id": 60` is always referenced as `R60`, regardless of where it appears in the array.

**When adding new calculations:**
1. Choose a unique ID that doesn't conflict with existing IDs
2. Use that ID in formulas (e.g., `R60 + R61`)
3. Array position only affects display order, not formula resolution

## Notes

- Some glassinputs components are placeholder stubs - replace with full implementations if available
- State persists to localStorage
- Vercel-compatible for deployment
