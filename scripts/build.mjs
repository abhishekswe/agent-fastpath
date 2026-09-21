// Bundles the CLI and the internal workspace packages into one file for npm.
// Third-party runtime dependencies stay external and are installed from npm.
import { build } from 'esbuild';
import { copyFileSync, readFileSync, rmSync, chmodSync } from 'fs';

const cliDir = 'packages/cli';
const pkg = JSON.parse(readFileSync(`${cliDir}/package.json`, 'utf8'));

rmSync(`${cliDir}/dist`, { recursive: true, force: true });

await build({
  entryPoints: [`${cliDir}/src/index.ts`],
  outfile: `${cliDir}/dist/index.js`,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  external: Object.keys(pkg.dependencies),
  define: { __FASTPATH_VERSION__: JSON.stringify(pkg.version) },
  legalComments: 'none',
  logLevel: 'warning'
});

chmodSync(`${cliDir}/dist/index.js`, 0o755);
copyFileSync('README.md', `${cliDir}/README.md`);
copyFileSync('LICENSE', `${cliDir}/LICENSE`);
console.log(`Built ${pkg.name}@${pkg.version} -> ${cliDir}/dist/index.js`);
