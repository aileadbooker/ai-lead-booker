import db from '../src/config/database';
import fs from 'fs';
import path from 'path';

async function setup() {
  console.log('Initializing SQLite database...');
  const schema = fs.readFileSync(path.join(__dirname, '../database/schema.sql'), 'utf8');
  const seed = fs.readFileSync(path.join(__dirname, '../database/seed.sql'), 'utf8');

  // Split schema and seed by semicolon for execution (basic approach)
  const statements = schema.split(';').concat(seed.split(';')).filter(s => s.trim() !== '');

  for (const statement of statements) {
    try {
      await db.query(statement);
    } catch (e) {
      console.warn('Statement failed:', statement.substring(0, 50), '...');
    }
  }

  console.log('Database setup complete!');
  process.exit(0);
}

setup();
