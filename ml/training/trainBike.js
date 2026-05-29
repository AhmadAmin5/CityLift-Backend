// ml/training/trainBike.js
import * as tf from '@tensorflow/tfjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Normalizer } from './normalizer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Feature order (MUST match prediction time exactly) ───
// Note: hour and day are converted to sin/cos (cyclical)
const FEATURE_NAMES = [
  'distance_km', 'travel_time_min', 'wait_time_min', 'traffic_ratio', 'avg_speed_kmh',
  'weather_code', 'rain_mm', 'visibility_m', 'wind_speed', 'feels_like_temp',
  'demand_ratio', 'zone_driver_count',
  'hour_sin', 'hour_cos', 'day_sin', 'day_cos',
  'is_weekend', 'is_public_holiday', 'is_ramadan'
];

// ─── Load and parse CSV ───
function loadData(csvPath) {
  const lines = fs.readFileSync(csvPath, 'utf8').trim().split('\n');
  const headers = lines[0].split(',');
  const idx = name => headers.indexOf(name);

  const features = [];
  const labels = [];

  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(',').map(Number);
    const hour = c[idx('hour')];
    const day = c[idx('day')];

    features.push([
      c[idx('distance_km')],
      c[idx('travel_time_min')],
      c[idx('wait_time_min')],
      c[idx('traffic_ratio')],
      c[idx('avg_speed_kmh')],
      c[idx('weather_code')],
      c[idx('rain_mm')],
      c[idx('visibility_m')],
      c[idx('wind_speed')],
      c[idx('feels_like_temp')],
      c[idx('demand_ratio')],
      c[idx('zone_driver_count')],
      Math.sin(2 * Math.PI * hour / 24),   // hour_sin
      Math.cos(2 * Math.PI * hour / 24),   // hour_cos
      Math.sin(2 * Math.PI * day / 7),     // day_sin
      Math.cos(2 * Math.PI * day / 7),     // day_cos
      c[idx('is_weekend')],
      c[idx('is_public_holiday')],
      c[idx('is_ramadan')],
    ]);
    labels.push(c[idx('surge_multiplier')]);
  }
  return { features, labels };
}

async function train() {
  console.log('Loading data...');
  const csvPath = path.join(__dirname, '..', 'data', 'datasets', 'bike_city.csv');
  const { features, labels } = loadData(csvPath);
  console.log(`Loaded ${features.length} samples, ${features[0].length} features each.`);

  // --- Shuffle + split 80/20 ---
  const indices = [...Array(features.length).keys()];
  tf.util.shuffle(indices);
  const splitAt = Math.floor(features.length * 0.8);
  const trainIdx = indices.slice(0, splitAt);
  const testIdx = indices.slice(splitAt);

  const trainX = trainIdx.map(i => features[i]);
  const trainY = trainIdx.map(i => labels[i]);
  const testX = testIdx.map(i => features[i]);
  const testY = testIdx.map(i => labels[i]);

  // --- Normalize features (fit on train only) ---
  console.log('Normalizing...');
  const normalizer = new Normalizer();
  normalizer.fit(trainX);
  const trainXn = normalizer.transformAll(trainX);
  const testXn = normalizer.transformAll(testX);

  // --- Tensors ---
  const xsTrain = tf.tensor2d(trainXn);
  const ysTrain = tf.tensor2d(trainY, [trainY.length, 1]);
  const xsTest = tf.tensor2d(testXn);
  const ysTest = tf.tensor2d(testY, [testY.length, 1]);

  // --- Build model ---
  console.log('Building model...');
  const model = tf.sequential();
  model.add(tf.layers.dense({ inputShape: [FEATURE_NAMES.length], units: 64, activation: 'relu' }));
  model.add(tf.layers.dropout({ rate: 0.15 }));
  model.add(tf.layers.dense({ units: 32, activation: 'relu' }));
  model.add(tf.layers.dropout({ rate: 0.10 }));
  model.add(tf.layers.dense({ units: 16, activation: 'relu' }));
  model.add(tf.layers.dense({ units: 1, activation: 'linear' }));

  model.compile({ optimizer: tf.train.adam(0.001), loss: 'meanSquaredError', metrics: ['mae'] });
  model.summary();

  // --- Train ---
  console.log('Training (this takes a few minutes with pure JS)...');
  await model.fit(xsTrain, ysTrain, {
    epochs: 40,
    batchSize: 256,
    validationSplit: 0.15,
    callbacks: {
      onEpochEnd: (epoch, logs) => {
        if (epoch % 5 === 0 || epoch === 39)
          console.log(`Epoch ${epoch}: loss=${logs.loss.toFixed(5)}, val_mae=${logs.val_mae.toFixed(4)}`);
      }
    }
  });

  // --- Evaluate ---
  const evalResult = model.evaluate(xsTest, ysTest);
  const testMae = (await evalResult[1].data())[0];
  console.log(`\nTest MAE: ${testMae.toFixed(4)} (avg error on surge multiplier)`);

// --- Save model + normalizer (manual handler for pure tfjs) ---
  const outDir = path.join(__dirname, '..', 'models', 'bike_city');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  await model.save(tf.io.withSaveHandler(async (artifacts) => {
    fs.writeFileSync(
      path.join(outDir, 'model.json'),
      JSON.stringify({
        modelTopology: artifacts.modelTopology,
        weightsManifest: [{
          paths: ['weights.bin'],
          weights: artifacts.weightSpecs
        }]
      })
    );
    fs.writeFileSync(path.join(outDir, 'weights.bin'), Buffer.from(artifacts.weightData));
    return { modelArtifactsInfo: { dateSaved: new Date(), modelTopologyType: 'JSON' } };
  }));

  normalizer.save(path.join(outDir, 'normalizer.json'));
  fs.writeFileSync(path.join(outDir, 'features.json'), JSON.stringify(FEATURE_NAMES, null, 2));
  console.log(`\nModel saved to ${outDir}`);

  // --- Quick scenario test ---
  console.log('\n── Scenario sanity check ──');
  const testScenario = (label, raw) => {
    const scaled = normalizer.transform(raw);
    const pred = model.predict(tf.tensor2d([scaled])).dataSync()[0];
    console.log(`  ${label}: surge = ${pred.toFixed(3)}`);
  };
  // [dist, travel, wait, traffic, avgspeed, weather, rain, vis, wind, temp, demand, drivers, hsin, hcos, dsin, dcos, wknd, hol, ram]
  testScenario('Clear, 8am rush, high demand',
    [8, 25, 6, 1.4, 19, 0, 0, 6000, 5, 25, 3.5, 8, Math.sin(2*Math.PI*8/24), Math.cos(2*Math.PI*8/24), Math.sin(2*Math.PI*1/7), Math.cos(2*Math.PI*1/7), 0, 0, 0]);
  testScenario('Heavy rain (should be LOWER)',
    [8, 25, 6, 1.4, 19, 4, 12, 7000, 8, 25, 1.5, 20, Math.sin(2*Math.PI*8/24), Math.cos(2*Math.PI*8/24), Math.sin(2*Math.PI*1/7), Math.cos(2*Math.PI*1/7), 0, 0, 0]);
  testScenario('3am, clear, low demand (should be LOW)',
    [5, 12, 3, 1.1, 25, 0, 0, 8000, 3, 22, 0.8, 25, Math.sin(2*Math.PI*3/24), Math.cos(2*Math.PI*3/24), Math.sin(2*Math.PI*2/7), Math.cos(2*Math.PI*2/7), 0, 0, 0]);
}

train().catch(console.error);