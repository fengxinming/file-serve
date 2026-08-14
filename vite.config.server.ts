import { defineConfig } from 'vite';
import { globSync } from 'tinyglobby';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, './package.json'), 'utf-8'));

// https://vite.dev/config/
export default defineConfig({
  build: {
    target: 'node20',
    emptyOutDir: true,
    minify: false,
    rollupOptions: {
      input: globSync(
        'server/**/*.ts',
        { ignore: ['**/*.d.ts'], cwd: __dirname }
      ).reduce<Record<string, string>>((acc, file) => {
        acc[file.slice(0, -3)] = join(__dirname, file)
        return acc
      }, { 'file-serve': join(__dirname, 'file-serve.ts') }),
      output: {
        dir: 'dist',
        format: 'esm',
        entryFileNames: '[name].mjs',
      },
      external: [...Object.keys(pkg.dependencies), ...builtinModules.map((builtinModule) => {
        return new RegExp(`^(?:node:)?${builtinModule.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}(?:/.+)*$`);
      })]
    }
  }
})
