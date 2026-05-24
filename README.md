# Glondia Ecommerce Website Services UI

This project is a React + Vite frontend remake of Glondia as an ecommerce website services platform.

## Stack

- React
- Vite
- Bootstrap 5
- React Router
- Lucide React

## Scripts

- `npm run dev` for local-only development
- `npm run dev:localhost` for an explicit localhost-only development session
- `npm run dev:global` for network-accessible development
- `npm run dev:session` for a shared session-style dev host
- `npm run build` for a production build
- `npm run preview` for local preview mode

## Structure

- `src/app` contains the router and layouts
- `src/components` contains shared public and dashboard components
- `src/features` contains route-level feature pages
- `src/data` contains connected mock data used across the public site and dashboard
- `src/services` contains local async service helpers for prototype flows
- `src/styles` contains Bootstrap overrides and app-wide styling
