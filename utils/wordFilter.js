// utils/wordFilter.js
const Filter = require('bad-words');
const filter = new Filter();

// Add any extra words the default list doesn't catch:
// filter.addWords('word1', 'word2');

// Remove any the default list flags that you don't want caught (e.g. it can
// be overly broad sometimes):
// filter.removeWords('word1', 'word2');

function containsBannedWord(text) {
  return filter.isProfane(text);
}

module.exports = { containsBannedWord };
