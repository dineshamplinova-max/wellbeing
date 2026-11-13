
import { createApp } from './app.js';
import Connection from './database/db.js';

let connectionPromise;

const databaseMiddleware = (req, res, next) => {
  if (!connectionPromise) {
    connectionPromise = Connection().catch((error) => {
      connectionPromise = null;
      throw error;
    });
  }

  connectionPromise.then(() => next()).catch(next);
};

const app = createApp(databaseMiddleware);

export default app;
