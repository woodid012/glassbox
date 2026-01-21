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

## Notes

- Some glassinputs components are placeholder stubs - replace with full implementations if available
- State persists to localStorage
- Vercel-compatible for deployment
