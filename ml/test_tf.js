import * as tf from '@tensorflow/tfjs';

async function test() {
  console.log('TensorFlow.js version:', tf.version.tfjs);

  const a = tf.tensor([1, 2, 3, 4]);
  const b = tf.tensor([10, 20, 30, 40]);
  a.add(b).print();   // should print [11, 22, 33, 44]

  const model = tf.sequential();
  model.add(tf.layers.dense({ inputShape: [3], units: 4, activation: 'relu' }));
  model.add(tf.layers.dense({ units: 1 }));
  model.compile({ optimizer: 'adam', loss: 'meanSquaredError' });
  console.log('Model built successfully.');
  console.log('TensorFlow.js is working correctly!');
}

test();