/* eslint-disable camelcase */
/** @type {import('node-pg-migrate').MigrationBuilder} */

exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable(
    'memories',
    {
      id: { type: 'uuid', primaryKey: true },
      text: { type: 'text', notNull: true },
      text_norm: { type: 'text', notNull: true },
      type: { type: 'text', notNull: true, default: 'note' },
      tags: { type: 'jsonb', notNull: true, default: pgm.func("'[]'::jsonb") },
      ts: { type: 'timestamptz', notNull: false },
      source: { type: 'text', notNull: true, default: 'manual' },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
      last_updated: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    },
    { ifNotExists: true }
  );

  pgm.createIndex('memories', 'text_norm', {
    name: 'memories_text_norm_key',
    unique: true,
    ifNotExists: true,
  });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('memories', { ifExists: true, cascade: true });
};
