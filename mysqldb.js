import { initDb, getPool, isConnected } from './src/dbState.js';

export { initDb as initDatabase, isConnected };

const poolProxy = new Proxy({}, {
  get(_, prop) {
    return (...args) => {
      const p = getPool();
      if (!p) {
        if (prop === 'execute' || prop === 'query') return Promise.resolve([[], null]);
        if (prop === 'getConnection') return Promise.reject(new Error('No DB connection'));
        return Promise.resolve(null);
      }
      return p[prop](...args);
    };
  },
});

export default poolProxy;
