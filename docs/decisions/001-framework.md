# ADR-001: Framework Selection

## Status
Accepted (2026-03-28)

> **更新 (2026-05-30)**: Nuxt 4.0 が 2025-07 に stable リリースされ標準化したため、本プロジェクトは **Nuxt 4** に統一する (`package.json`: `nuxt ^4.4`)。フレームワーク選定 (Vue/Nuxt) の判断自体は不変で、メジャーバージョン表記のみ更新。

## Context
Badminton analytics app for team use. The developer is a data engineer with strong Python/SQL skills but limited web development experience. The app requires:
- Multi-user support (team usage)
- BI dashboard-like analytics views
- Data input and management

## Decision

### Framework: Nuxt 4 (Vue 3)

| Option | Pros | Cons |
|--------|------|------|
| **Nuxt (Vue)** ✅ | Template syntax close to HTML, easy to read for beginners. SFC separates HTML/CSS/JS clearly. | Smaller ecosystem than React. Fewer chart libraries. |
| Next.js (React) | Largest ecosystem. Best AI code generation accuracy. Dashboard-specific libraries (Tremor). | JSX mixes HTML/JS. Hooks concept has learning curve. |
| Streamlit (Python) | Familiar language (Python). Fastest for dashboards. | Poor multi-user support. Limited UI customization. Not suitable for team web apps. |

**Why Nuxt:** Code readability for a web development beginner outweighs marginal AI generation accuracy advantage of Next.js. Vue's template syntax (`v-for`, `v-if`) is intuitive and close to HTML.

### Package Manager: pnpm

| Option | Pros | Cons |
|--------|------|------|
| **pnpm** ✅ | Fast, strict dependency management, disk efficient (symlinks) | Requires separate install |
| npm | Bundled with Node.js, most documentation | Slower, loose dependency management |
| bun | Fastest | Occasional compatibility issues |

**Why pnpm:** Similar to Python's poetry — strict and fast. Recommended by Nuxt community.

### UI: Nuxt UI (Tailwind CSS based)

| Option | Pros | Cons |
|--------|------|------|
| **Nuxt UI** ✅ | Nuxt-native components. Buttons, tables, forms ready to use. Consistent design. | Nuxt-specific (not portable) |
| shadcn/ui + Tailwind | Highly customizable. Popular in React/Vue. | More setup required |
| Tailwind only | Maximum flexibility | Must build every UI element from scratch |
| CSS Modules | No additional libraries. Standard CSS. | Requires design skills and CSS knowledge |

**Why Nuxt UI:** Like plotly for data visualization — looks good out of the box with minimal effort. Best for someone without web design experience.

### Charts: Apache ECharts (vue-echarts) — to be added later

**Why ECharts:** Most comprehensive chart library for BI dashboards. Similar to Plotly in Python. Used by Apache Superset internally. Framework-agnostic (works with both Vue and React).

### Database: TBD

Will be decided after writing specifications and understanding data model requirements.

## Consequences
- Development will use TypeScript + Vue SFC with Composition API
- UI components from Nuxt UI library
- Charts to be added when dashboard features are implemented
