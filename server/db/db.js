import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mailflow';

export async function initializeDatabase() {
  try {
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
    console.log('✓ MongoDB connected to:', MONGODB_URI);
    return mongoose.connection;
  } catch (error) {
    console.log(`⚡ Could not connect to primary MongoDB (${MONGODB_URI}): ${error.message}`);
    try {
      console.log('⚡ Starting automatic in-memory MongoDB server fallback...');
      const { MongoMemoryServer } = await import('mongodb-memory-server');
      const mongod = await MongoMemoryServer.create();
      const uri = mongod.getUri();
      await mongoose.connect(uri);
      console.log('✓ Connected to in-memory MongoDB server successfully:', uri);
      return mongoose.connection;
    } catch (memErr) {
      console.error('❌ In-memory MongoDB fallback failed:', memErr.message);
      throw error;
    }
  }
}

export function getDatabase() {
  return mongoose.connection;
}

export function closeDatabase() {
  mongoose.connection.close();
}

// These are legacy SQL helpers. We'll mark them as deprecated or 
// implement them with a warning if we need temporary compatibility.
// For now, it's better to refactor code to use Mongoose models directly.

export function query(sql, params = []) {
  console.warn('DEPRECATED: query() called with SQL. Refactor to use Mongoose models.');
  return [];
}

export function queryOne(sql, params = []) {
  console.warn('DEPRECATED: queryOne() called with SQL. Refactor to use Mongoose models.');
  return null;
}

export function run(sql, params = []) {
  console.warn('DEPRECATED: run() called with SQL. Refactor to use Mongoose models.');
  return { lastInsertRowid: null };
}

export default {
  initializeDatabase,
  getDatabase,
  closeDatabase,
  query,
  queryOne,
  run,
};
