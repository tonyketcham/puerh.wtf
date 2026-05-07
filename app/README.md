# puerh.wtf - Next.js Migration

This is the Next.js version of puerh.wtf, migrated from SvelteKit 1.0.

## Features

- **Static Site Generation (SSG)** - All pages are pre-rendered at build time
- **Flatbread CMS** - Headless CMS for content management
- **TypeScript** - Full type safety
- **Tailwind CSS** - Utility-first CSS framework
- **Responsive Design** - Mobile-first approach

## Getting Started

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Start the development server:

   ```bash
   pnpm dev
   ```

3. Build for production:
   ```bash
   pnpm build
   ```

## Project Structure

- `src/app/` - Next.js App Router pages and layouts
- `src/lib/` - Shared utilities, components, and types
- `content/` - Flatbread CMS content (unchanged from original)
- `static/` - Static assets (unchanged from original)

## Migration Notes

- Converted all Svelte components to React components
- Replaced SvelteKit API routes with Next.js API functions
- Maintained the same visual design and functionality
- Preserved all content and Flatbread configuration
- Updated build system to use Next.js instead of Vite

## Environment Variables

- `FLATBREAD_URL` - URL for the Flatbread GraphQL endpoint (defaults to `http://localhost:3001/graphql`)

## Development

The development server will start on `http://localhost:3000` by default. Make sure Flatbread is running on port 3001 for content to load properly.
