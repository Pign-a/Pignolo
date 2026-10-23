'use strict';
const nums = process.argv.slice(2).map(Number);
if (nums.some(Number.isNaN)) {
  console.error('Solo números.');
  process.exit(1);
}
console.log(nums.reduce((a, b) => a + b, 0));
