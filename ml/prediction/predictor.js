// ml/prediction/predictor.js
// Serving layer: loads a trained model by vehicle+scope and turns live ride
// conditions into a surge multiplier (and an optional fare estimate).
//
// It reuses the SAME feature encoder (lib/features.js) and Normalizer
// (training/normalizer.js) used at training time, so the input pipeline can
// never drift between training and inference.
//
//   import { predictSurge, estimateFare } from './ml/prediction/predictor.js';
//   const surge = await predictSurge('bike', 'city', rawInput);
import * as tf from '@tensorflow/tfjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Normalizer } from '../training/normalizer.js';
import { buildFeatureRow } from '../lib/features.js';
import { MODEL_NAMES, getConfig } from '../configs/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODELS_DIR = path.join(__dirname, '..', 'models');

// Loaded bundles are cached so each model's files are read + parsed only once.
const cache = new Map();

// Custom IOHandler so pure @tensorflow/tfjs (no tfjs-node) can load the model
// files written by train.js (model.json + raw weights.bin).
function fileHandler(modelDir) {
  return {
    load: async () => {
      const modelJSON = JSON.parse(fs.readFileSync(path.join(modelDir, 'model.json'), 'utf8'));
      const buf = fs.readFileSync(path.join(modelDir, 'weights.bin'));
      return {
        modelTopology: modelJSON.modelTopology,
        weightSpecs: modelJSON.weightsManifest[0].weights,
        weightData: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      };
    },
  };
}

// Which raw input keys a feature list needs (cyclical features fold back to
// their source column, e.g. hour_sin/hour_cos -> hour).
function requiredRawKeys(featureNames) {
  const keys = new Set();
  for (const f of featureNames) {
    if (f.startsWith('hour_')) keys.add('hour');
    else if (f.startsWith('day_')) keys.add('day');
    else if (f.startsWith('month_')) keys.add('month');
    else keys.add(f);
  }
  return [...keys];
}

async function loadModel(name) {
  if (cache.has(name)) return cache.get(name);

  const dir = path.join(MODELS_DIR, name);
  if (!fs.existsSync(path.join(dir, 'model.json'))) {
    throw new Error(`Model "${name}" not trained yet (missing ${dir}/model.json).`);
  }

  const model = await tf.loadLayersModel(fileHandler(dir));
  const featureNames = JSON.parse(fs.readFileSync(path.join(dir, 'features.json'), 'utf8'));
  const normalizer = new Normalizer();
  normalizer.load(path.join(dir, 'normalizer.json'));
  const config = await getConfig(name);

  const bundle = { model, featureNames, normalizer, fare: config.fare, required: requiredRawKeys(featureNames) };
  cache.set(name, bundle);
  return bundle;
}

// Predict the surge multiplier for one ride.
//   vehicle: 'bike' | 'rickshaw' | 'minicar' | 'economy' | 'parcel'
//   scope:   'city' | 'intercity'
//   rawInput: object with the raw condition columns (distance_km, hour, ...)
// Returns a number clamped to the vehicle's [0.80, max_surge] range.
export async function predictSurge(vehicle, scope, rawInput) {
  const name = `${vehicle}_${scope}`;
  if (!MODEL_NAMES.includes(name)) {
    throw new Error(`Unknown model "${name}". Valid: ${MODEL_NAMES.join(', ')}`);
  }

  const { model, featureNames, normalizer, fare, required } = await loadModel(name);

  // Validate every required raw field is present and a finite number.
  const missing = required.filter((k) => typeof rawInput[k] !== 'number' || !Number.isFinite(rawInput[k]));
  if (missing.length) {
    throw new Error(`predictSurge(${name}): missing/invalid numeric fields: ${missing.join(', ')}`);
  }

  const row = buildFeatureRow(rawInput, featureNames);
  const scaled = normalizer.transform(row);

  const input = tf.tensor2d([scaled]);
  const out = model.predict(input);
  const surge = (await out.data())[0];
  input.dispose();
  out.dispose();

  // Guard rails: model can extrapolate slightly past training range.
  const clamped = Math.max(0.8, Math.min(surge, fare.max_surge));
  return +clamped.toFixed(3);
}

// Convenience: turn a surge multiplier into a transparent fare estimate using
// the vehicle's fare config. per_min is absent for intercity (treated as 0);
// intercity tolls are added on top of the surged fare.
export async function estimateFare(vehicle, scope, rawInput) {
  const name = `${vehicle}_${scope}`;
  const { fare } = await loadModel(name);
  const surge = await predictSurge(vehicle, scope, rawInput);

  const perMin = fare.per_min || 0;
  const base =
    fare.base_fare +
    fare.per_km * (rawInput.distance_km || 0) +
    perMin * (rawInput.travel_time_min || 0);

  let total = base * surge;
  if (fare.min_fare) total = Math.max(fare.min_fare, total);
  if (scope === 'intercity') total += rawInput.toll_cost || 0;

  return {
    surge_multiplier: surge,
    fare_before_surge: +base.toFixed(2),
    total_fare: Math.round(total),
    currency: 'PKR',
  };
}
