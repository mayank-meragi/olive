# Olive — Firefox Extension (React + TypeScript + Tailwind + shadcn/ui)

Tech stack
- WXT: modern web extension framework (Firefox-ready)
- React + TypeScript
- Tailwind CSS v3
- shadcn/ui primitives (via local components)

Scripts
- `npm run dev:firefox`: run dev server and launch Firefox
- `npm run build:firefox`: build production extension for Firefox
- `npm run zip:firefox`: build and zip for distribution

Tailwind
- Config: `tailwind.config.ts`
- PostCSS: `postcss.config.cjs`
- Global CSS: `entrypoints/popup/style.css`

shadcn/ui
- Components live in `entrypoints/popup/components`
- Utils live in `entrypoints/popup/lib`
- Config for CLI adds aliases: `components.json`
- Example component: `entrypoints/popup/components/ui/button.tsx`

Development
1. Install deps: `npm install`
2. Start Firefox dev: `npm run dev:firefox`
3. Edit popup UI at `entrypoints/popup/App.tsx`

Build
- Outputs to `.output/firefox-mv2`
# olive
