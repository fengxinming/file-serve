import { defineConfig } from 'vite';
import { globSync } from 'tinyglobby';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import external from 'vite-plugin-external';


const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, './package.json'), 'utf-8'));

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    external({
      nodeBuiltins: true,
      externalizeDeps: Object.keys(pkg.dependencies)
    })
  ],
  publicDir: false,
  build: {
    target: 'node20',
    emptyOutDir: true,
    minify: false,
    rollupOptions: {
      input: globSync('src/server/**/*.ts', { ignore: ['**/*.d.ts'], cwd: __dirname }).reduce<
        Record<string, string>
      >(
        (acc, file) => {
          acc[file.slice(0, -3)] = join(__dirname, file);
          return acc;
        },
        { 'lansrv': join(__dirname, 'src/lansrv.ts') },
      ),
      output: {
        dir: 'dist',
        format: 'esm',
        // entryFileNames: '[name].mjs',
        entryFileNames(chunkInfo) {
          return chunkInfo.name.replace('src/', '') + '.mjs';
        }
      }
    },
  },
});
