This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Code Quality Tools

This project is configured with ESLint and Prettier to maintain code quality and consistent formatting.

### Available Scripts

- `npm run lint` - Run ESLint to check for code issues
- `npm run lint:fix` - Automatically fix ESLint issues where possible
- `npm run format` - Format all files with Prettier
- `npm run format:check` - Check if files are formatted correctly
- `npm run type-check` - Run TypeScript compiler to check for type errors

### ESLint Configuration

ESLint is configured with:

- Next.js recommended rules
- TypeScript support with `@typescript-eslint`
- React hooks linting
- Prettier integration to avoid conflicts

### Prettier Configuration

Prettier is configured with sensible defaults:

- 2 spaces for indentation
- Semicolons enabled
- Double quotes for strings
- 80 character line width
- Trailing commas in ES5

### Editor Integration

For the best development experience, install the recommended VS Code extensions:

- ESLint (`dbaeumer.vscode-eslint`)
- Prettier (`esbenp.prettier-vscode`)
- Tailwind CSS IntelliSense (`bradlc.vscode-tailwindcss`)
- Prisma (`prisma.prisma`)

The project includes VS Code settings that enable:

- Format on save
- Auto-fix ESLint issues on save
- Proper TypeScript integration

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
