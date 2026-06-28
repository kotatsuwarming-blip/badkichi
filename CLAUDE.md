# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Communication

Always communicate with the user in Japanese. CLAUDE.md itself must be written in English.

## Project

Badminton analytics app for team use. Built with Nuxt 4 (Vue 3) + Nuxt UI + TypeScript.

## Commands

- `pnpm dev` — Start dev server (http://localhost:3000)
- `pnpm build` — Production build
- `pnpm lint` — Run ESLint
- `pnpm typecheck` — Run TypeScript type checking
- `pnpm preview` — Preview production build

## Coding Conventions

- Vue SFC (Single File Component) with `<script setup lang="ts">`
- Composition API only (no Options API)
- TypeScript strict mode
- Use Nuxt UI components for UI elements
- ESLint config: 1tbs brace style, no comma dangle

## Branch & PR workflow

- `main` is the source of truth and the production branch (Vercel auto-deploys `main`).
- `dev` is an integration branch for local verification only — never use it as a PR base.
- Always branch off `main`, named by purpose:
  - `feature/xxx` — new features
  - `fix/xxx` — bug fixes
  - `docs/xxx` — documentation additions/changes
- Flow for every change:
  1. Branch off `main`.
  2. Make the change.
  3. Merge the branch into `dev` (direct merge, no PR) and push.
  4. Host `dev` locally and verify the behavior.
  5. Once it works, open a PR from the branch to `main`.
- Keep each PR to a single logical unit.

## Directory Structure

- `app/` — Application source code
  - `pages/` — File-based routing
  - `components/` — Vue components
  - `assets/` — CSS and static assets
- `docs/` — Documentation (tsumiki convention)
  - `spec/{requirement-name}/` — Requirement definitions
  - `design/{requirement-name}/` — Technical design documents
  - `tasks/{requirement-name}/` — Task breakdowns
  - `implements/{requirement-name}/{task-id}/` — Implementation records
  - `rule/` — Project-specific rules for tsumiki commands
  - `decisions/` — Architecture Decision Records (ADR)
- `public/` — Static files served as-is
