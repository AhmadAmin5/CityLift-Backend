// ml/training/normalizer.js
import fs from 'fs';

export class Normalizer {
  constructor() {
    this.means = [];
    this.stds = [];
  }

  // Compute mean and std from training feature rows
  fit(featureRows) {
    const n = featureRows.length;
    const numFeatures = featureRows[0].length;
    this.means = new Array(numFeatures).fill(0);
    this.stds = new Array(numFeatures).fill(0);

    // Mean
    for (const row of featureRows)
      for (let f = 0; f < numFeatures; f++) this.means[f] += row[f];
    for (let f = 0; f < numFeatures; f++) this.means[f] /= n;

    // Std
    for (const row of featureRows)
      for (let f = 0; f < numFeatures; f++)
        this.stds[f] += Math.pow(row[f] - this.means[f], 2);
    for (let f = 0; f < numFeatures; f++) {
      this.stds[f] = Math.sqrt(this.stds[f] / n) || 1; // avoid div by zero
    }
  }

  // Scale one feature row
  transform(row) {
    return row.map((v, i) => (v - this.means[i]) / this.stds[i]);
  }

  // Scale many rows
  transformAll(rows) {
    return rows.map(r => this.transform(r));
  }

  save(filepath) {
    fs.writeFileSync(filepath, JSON.stringify({ means: this.means, stds: this.stds }, null, 2));
  }

  load(filepath) {
    const d = JSON.parse(fs.readFileSync(filepath, 'utf8'));
    this.means = d.means;
    this.stds = d.stds;
  }
}