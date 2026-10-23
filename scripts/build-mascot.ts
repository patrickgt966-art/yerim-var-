// Writes design/maskot.js from src/components/mascot/geometry.ts (the single source of Yerim's
// drawing). Run after changing the geometry: npm run build-mascot
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { designMascotJs } from '../src/components/mascot/designJs';

const out = join(__dirname, '..', 'design', 'maskot.js');
writeFileSync(out, designMascotJs());
console.log(`wrote ${out}`);
