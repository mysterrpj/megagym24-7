
console.time('Load');
const functions = require('./lib/index.js');
console.timeEnd('Load');
console.log('Loaded keys:', Object.keys(functions));
process.exit(0);
