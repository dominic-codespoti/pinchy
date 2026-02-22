# Pinchy Web (React)

New React/TypeScript frontend for the gateway dashboard.

## Stack

- React + TypeScript + Vite
- TanStack Router + TanStack Query
- Zustand
- React Hook Form + Zod
- Tailwind CSS + Sonner

## Development

```bash
cd web
pnpm install
pnpm run dev
```

Vite dev server defaults to port 5173 and proxies are not required for same-host usage if launched with the daemon.

## Build

```bash
cd web
pnpm run build
```

Build output is written to `static/react/`.

Access via:

- `http://127.0.0.1:3000/react/index.html`
