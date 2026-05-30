// ml/configs/index.js
// Registry of available model configs. Each config lives in its own file named
// after its `name` (e.g. bike_city.js) and is loaded on demand, so adding a new
// vehicle is just dropping a file in this folder and listing it here.
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const MODEL_NAMES = [
  'bike_city',
  'rickshaw_city',
  'minicar_city',
  'economy_city',
  'parcel_city',
  'minicar_intercity',
  'economy_intercity',
  'parcel_intercity',
];

// Load a single config by name. Throws a helpful error if the name is unknown
// or the file hasn't been written yet.
export async function getConfig(name) {
  if (!MODEL_NAMES.includes(name)) {
    throw new Error(`Unknown model "${name}". Valid: ${MODEL_NAMES.join(', ')}`);
  }
  const fileUrl = pathToFileURL(path.join(__dirname, `${name}.js`)).href;
  try {
    const mod = await import(fileUrl);
    return mod.default;
  } catch (err) {
    throw new Error(`Config "${name}" is registered but not yet implemented (${name}.js). ${err.message}`);
  }
}
