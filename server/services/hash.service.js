const crypto = require('crypto');

function calculateEntryHash(entryData, previousHash) {
  const dataString = [
    entryData.id || '',
    entryData.entryDate?.toISOString() || '',
    entryData.description || '',
    entryData.debit?.toString() || '0',
    entryData.credit?.toString() || '0',
    entryData.accountId || '',
    previousHash || '0'
  ].join('|');
  return crypto.createHash('sha256').update(dataString).digest('hex');
}

async function verifyChain(db) {
  const entries = await db.journalEntry.findMany({ orderBy: { createdAt: 'asc' } });
  let isValid = true;
  let previousHash = '0';
  const brokenEntries = [];
  for (const entry of entries) {
    const expectedHash = calculateEntryHash(entry, previousHash);
    if (entry.currentHash !== expectedHash) {
      isValid = false;
      brokenEntries.push(entry.id);
    }
    previousHash = entry.currentHash;
  }
  return { isValid, brokenEntries, totalEntries: entries.length };
}

module.exports = { calculateEntryHash, verifyChain };
