import { build } from 'esbuild'

const result = await build({
  entryPoints: ['src/entry.js'],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome110'],
  minify: true,
  sourcemap: false,
  legalComments: 'none',
  outfile: 'client.js',
  define: {
    'process.env.NODE_ENV': '"production"',
    __FLOATING_NOTES_BUILD__: JSON.stringify(new Date().toISOString()),
  },
  banner: {
    js: '/** dsh-floating-notes — bundled from src/ by esbuild. Do not edit by hand; run `npm run build`. */',
  },
  metafile: true,
})

const output = Object.values(result.metafile.outputs)[0]
console.log('client.js', (output.bytes / 1024).toFixed(1) + ' KiB')
