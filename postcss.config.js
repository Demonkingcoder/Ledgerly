import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const externalModules = process.env.LEDGERLY_NODE_MODULES?.replace(/[\\/]+$/, '');
const fromDependencies = externalModules ? createRequire(path.join(externalModules, 'package.json')) : createRequire(import.meta.url);
const tailwindcss = fromDependencies('tailwindcss');
const autoprefixer = fromDependencies('autoprefixer');
const projectConfig = fileURLToPath(new URL('./tailwind.config.js', import.meta.url));

export default { plugins: [(tailwindcss.default ?? tailwindcss)({ config: projectConfig }), autoprefixer.default ?? autoprefixer] };
