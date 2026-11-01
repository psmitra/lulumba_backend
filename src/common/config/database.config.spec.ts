import { describe, expect, it } from 'vitest';
import { buildMongoUri } from './database.config.js';

describe('buildMongoUri', () => {
  it('builds a local URI without credentials', () => {
    expect(
      buildMongoUri({
        host: 'localhost',
        port: 27017,
        srv: false,
        database: 'lulumba',
      }),
    ).toBe('mongodb://localhost:27017/lulumba');
  });

  it('builds an SRV URI with encoded credentials and options, ignoring port', () => {
    expect(
      buildMongoUri({
        host: 'cluster0.example.mongodb.net',
        port: 27017,
        srv: true,
        database: 'lulumba',
        username: 'user',
        password: 'p@ss:w/rd',
        options: 'retryWrites=true&w=majority',
      }),
    ).toBe(
      'mongodb+srv://user:p%40ss%3Aw%2Frd@cluster0.example.mongodb.net/lulumba?retryWrites=true&w=majority',
    );
  });
});
