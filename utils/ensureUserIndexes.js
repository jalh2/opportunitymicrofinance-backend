const User = require('../models/User');

/**
 * Ensures the User collection has the correct indexes:
 * - Compound unique on (branchCode, email)
 * - Compound unique on (branchCode, username)
 * And removes any old unique indexes on just email or username that would
 * incorrectly enforce global uniqueness across branches.
 */
async function ensureUserIndexes() {
  try {
    // Let Mongoose reconcile indexes with the schema definition
    // This will create missing indexes and drop obsolete ones
    await User.syncIndexes();
    console.log('[Indexes] User indexes synced successfully');
  } catch (err) {
    console.error('[Indexes] User.syncIndexes failed, attempting targeted cleanup', err);
    try {
      const indexes = await User.collection.indexes();
      const drops = [];
      for (const idx of indexes) {
        const key = idx.key || {};
        const isLegacyUsername = idx.unique && key && Object.keys(key).length === 1 && key.username === 1;
        const isLegacyEmail = idx.unique && key && Object.keys(key).length === 1 && key.email === 1;
        if (isLegacyUsername || isLegacyEmail) {
          drops.push(idx.name);
        }
      }
      for (const name of drops) {
        try {
          await User.collection.dropIndex(name);
          console.log(`[Indexes] Dropped legacy User index: ${name}`);
        } catch (e) {
          // Ignore if already dropped in race
          if (e && e.codeName !== 'IndexNotFound') {
            throw e;
          }
        }
      }
      // Try again to sync after targeted drops
      await User.syncIndexes();
      console.log('[Indexes] User indexes synced after targeted cleanup');
    } catch (e2) {
      console.error('[Indexes] Failed to reconcile User indexes', e2);
    }
  }
}

module.exports = { ensureUserIndexes };
