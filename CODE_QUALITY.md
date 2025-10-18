# Code Quality Setup

This document describes the code quality tools and configurations set up in this project.

## Tools Installed

### ESLint

ESLint is configured to catch common bugs and enforce code quality standards.

**Installed packages:**

- `eslint` - Core linting engine
- `@typescript-eslint/eslint-plugin` - TypeScript-specific linting rules
- `@typescript-eslint/parser` - TypeScript parser for ESLint
- `eslint-config-next` - Next.js recommended configuration
- `eslint-plugin-prettier` - Runs Prettier as an ESLint rule
- `eslint-config-prettier` - Disables ESLint rules that conflict with Prettier

### Prettier

Prettier is configured to automatically format code consistently.

**Installed packages:**

- `prettier` - Core formatting engine
- `eslint-plugin-prettier` - Integration with ESLint
- `eslint-config-prettier` - Prevents conflicts with ESLint

## Configuration Files

### `.prettierrc`

Prettier configuration with the following settings:

- **Semicolons**: Required
- **Quotes**: Double quotes
- **Trailing commas**: ES5 style (objects, arrays)
- **Indentation**: 2 spaces
- **Line width**: 80 characters
- **End of line**: LF (Unix-style)

### `eslint.config.mjs`

ESLint configuration includes:

- Next.js core web vitals rules
- TypeScript recommended rules
- React hooks validation
- Prettier integration
- Custom rules for code quality

### `.editorconfig`

EditorConfig ensures consistent formatting across different editors and IDEs.

### `.vscode/settings.json`

VS Code workspace settings for automatic formatting and linting on save.

## NPM Scripts

Run these commands from the project root:

```bash
# Linting
npm run lint          # Check for linting issues
npm run lint:fix      # Auto-fix linting issues

# Formatting
npm run format        # Format all files
npm run format:check  # Check if files are formatted

# Type checking
npm run type-check    # Check TypeScript types
```

## Workflow Integration

### Pre-commit Workflow (Recommended)

For best results, run these commands before committing:

```bash
npm run format        # Format code
npm run lint:fix      # Fix linting issues
npm run type-check    # Check types
```

### CI/CD Integration

Add these checks to your CI/CD pipeline:

```yaml
# Example GitHub Actions
- name: Check formatting
  run: npm run format:check

- name: Lint
  run: npm run lint

- name: Type check
  run: npm run type-check
```

## Editor Setup

### VS Code (Recommended)

1. Install recommended extensions (prompted automatically)
2. Settings are pre-configured in `.vscode/settings.json`
3. Code will auto-format on save
4. ESLint issues will be highlighted in real-time

### Other Editors

Install these plugins for your editor:

- **ESLint plugin** - For linting support
- **Prettier plugin** - For formatting support
- **EditorConfig plugin** - For consistent formatting

## ESLint Rules Overview

### TypeScript Rules

- Warn on unused variables (prefix with `_` to ignore)
- Warn on explicit `any` types
- Warn on non-null assertions (`!`)
- Allow implicit return types

### Code Quality Rules

- Warn on `console.log` (allow `console.warn` and `console.error`)
- Prefer `const` over `let`
- Disallow `var` keyword

### React Rules

- No need to import React in JSX files
- Enforce React hooks rules
- Warn on missing dependencies in hooks

## Troubleshooting

### ESLint and Prettier Conflicts

If you see conflicts between ESLint and Prettier:

1. Make sure `eslint-config-prettier` is installed
2. Ensure it's the last config in `eslint.config.mjs`
3. Run `npm run format` to fix formatting issues

### Editor Not Auto-Formatting

1. Check that Prettier extension is installed
2. Verify `.vscode/settings.json` exists
3. Reload VS Code window
4. Check that Prettier is set as default formatter

### Linting Errors on Build

Make sure to run linting locally before pushing:

```bash
npm run lint:fix
npm run format
```

## Best Practices

1. **Format before committing** - Always run `npm run format` before commits
2. **Fix linting issues** - Don't ignore ESLint warnings
3. **Use TypeScript types** - Avoid `any` when possible
4. **Follow naming conventions** - Use 3+ word combinations for function/variable names
5. **Keep console clean** - Remove debug `console.log` statements

## Future Enhancements

Consider adding:

- **Husky** - Git hooks for pre-commit checks
- **lint-staged** - Run linting only on staged files
- **commitlint** - Enforce conventional commit messages
- **Jest** - Unit testing with coverage reports
