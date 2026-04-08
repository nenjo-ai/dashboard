# Frontend Application

This is the Next.js frontend application with TypeScript and Tailwind CSS.

## Getting Started

First, install dependencies:

```bash
npm install
```

Then, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Project Structure

- `/app` - Next.js 13+ app directory with routing
  - `/dashboard` - Protected dashboard routes
  - `layout.tsx` - Root layout
  - `page.tsx` - Home page
- `tailwind.config.ts` - Tailwind configuration with PRD theme colors
- `tsconfig.json` - TypeScript configuration

## Theme Colors

The following theme colors are configured in Tailwind:
- `deep-space-blue` - Primary brand color
- `flag-red` - Alert/error color
- `vivid-tangerine` - Accent color
- `sunflower-gold` - Warning/highlight color
- `vanilla-custard` - Light background color

## Next Steps

1. Integrate Clerk authentication
2. Connect to backend APIs
3. Implement protected routes
4. Add real dashboard functionality