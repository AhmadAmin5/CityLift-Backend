// ml/training/train.js
// Generic, config-driven trainer.
//   node ml/training/train.js <model_name>
//   e.g. node ml/training/train.js bike_city
//
// Reads ml/data/datasets/<name>.csv, encodes features via the shared
// features module (single source of truth), trains a small regression net,
// and saves model + normalizer + feature list to ml/models/<name>/.
import * as tf from '@tensorflow/tfjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Normalizer } from './normalizer.js';
import { getConfig } from '../configs/index.js';
import { FEATURE_SETS, buildFeatureRow } from '../lib/features.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load CSV into raw records, then encode each into the model input vector.
function loadData(csvPath, featureNames) {
  const lines = fs.readFileSync(csvPath, 'utf8').trim().split('\n');
  const headers = lines[0].split(',');

  const features = [];
  const labels = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(Number);
    const rec = {};
    headers.forEach((h, j) => { rec[h] = cols[j]; });
    features.push(buildFeatureRow(rec, featureNames));
    labels.push(rec.surge_multiplier);
  }
  return { features, labels };
}

async function main() {
  const name = process.argv[2];
  if (!name) {
    console.error('Usage: node ml/training/train.js <model_name>');
    process.exit(1);
  }

  const config = await getConfig(name);
  const featureNames = FEATURE_SETS[config.featureSet];
  if (!featureNames) throw new Error(`Unknown featureSet "${config.featureSet}" in ${name}`);

  const csvPath = path.join(__dirname, '..', 'data', 'datasets', `${name}.csv`);
  if (!fs.existsSync(csvPath)) {
    throw new Error(`Dataset not found: ${csvPath}\nRun: node ml/data/generator.js ${name}`);
  }

  console.log(`Loading ${name} data...`);
  const { features, labels } = loadData(csvPath, featureNames);
  console.log(`Loaded ${features.length} samples, ${features[0].length} features each.`);

  // Shuffle + 80/20 split
  const indices = [...Array(features.length).keys()];
  tf.util.shuffle(indices);
  const splitAt = Math.floor(features.length * 0.8);
  const trainIdx = indices.slice(0, splitAt);
  const testIdx = indices.slice(splitAt);

  const trainX = trainIdx.map((i) => features[i]);
  const trainY = trainIdx.map((i) => labels[i]);
  const testX = testIdx.map((i) => features[i]);
  const testY = testIdx.map((i) => labels[i]);

  // Normalize (fit on train only)
  console.log('Normalizing...');
  const normalizer = new Normalizer();
  normalizer.fit(trainX);
  const trainXn = normalizer.transformAll(trainX);
  const testXn = normalizer.transformAll(testX);

  const xsTrain = tf.tensor2d(trainXn);
  const ysTrain = tf.tensor2d(trainY, [trainY.length, 1]);
  const xsTest = tf.tensor2d(testXn);
  const ysTest = tf.tensor2d(testY, [testY.length, 1]);

  // Model (same topology as the proven bike model)
  console.log('Building model...');
  const model = tf.sequential();
  model.add(tf.layers.dense({ inputShape: [featureNames.length], units: 64, activation: 'relu' }));
  model.add(tf.layers.dropout({ rate: 0.15 }));
  model.add(tf.layers.dense({ units: 32, activation: 'relu' }));
  model.add(tf.layers.dropout({ rate: 0.10 }));
  model.add(tf.layers.dense({ units: 16, activation: 'relu' }));
  model.add(tf.layers.dense({ units: 1, activation: 'linear' }));
  model.compile({ optimizer: tf.train.adam(0.001), loss: 'meanSquaredError', metrics: ['mae'] });
  model.summary();

  console.log('Training (pure JS — takes a few minutes)...');
  await model.fit(xsTrain, ysTrain, {
    epochs: 40,
    batchSize: 256,
    validationSplit: 0.15,
    callbacks: {
      onEpochEnd: (epoch, logs) => {
        if (epoch % 5 === 0 || epoch === 39)
          console.log(`Epoch ${epoch}: loss=${logs.loss.toFixed(5)}, val_mae=${logs.val_mae.toFixed(4)}`);
      },
    },
  });

  const evalResult = model.evaluate(xsTest, ysTest);
  const testMae = (await evalResult[1].data())[0];
  console.log(`\nTest MAE: ${testMae.toFixed(4)} (avg error on surge multiplier)`);

  // Save model + normalizer + feature list
  const outDir = path.join(__dirname, '..', 'models', name);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  await model.save(tf.io.withSaveHandler(async (artifacts) => {
    fs.writeFileSync(
      path.join(outDir, 'model.json'),
      JSON.stringify({
        modelTopology: artifacts.modelTopology,
        weightsManifest: [{ paths: ['weights.bin'], weights: artifacts.weightSpecs }],
      })
    );
    fs.writeFileSync(path.join(outDir, 'weights.bin'), Buffer.from(artifacts.weightData));
    return { modelArtifactsInfo: { dateSaved: new Date(), modelTopologyType: 'JSON' } };
  }));

  normalizer.save(path.join(outDir, 'normalizer.json'));
  fs.writeFileSync(path.join(outDir, 'features.json'), JSON.stringify(featureNames, null, 2));
  console.log(`\nModel saved to ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
