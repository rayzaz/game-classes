// Run AFTER npm run build. Validates the Netlify Functions import graph,
// including dependencies which TypeScript/Vite normally do not bundle.
import {build} from 'esbuild';
for (const entryPoint of [
  'netlify/functions/bank-stars-operation-v3.mjs',
  'netlify/functions/admin-banker-access.mjs'
]) {
  await build({entryPoints:[entryPoint],platform:'node',format:'esm',
    bundle:true,write:false,packages:'external',logLevel:'warning'});
  console.log('NETLIFY FUNCTION GRAPH PASS: '+entryPoint);
}
