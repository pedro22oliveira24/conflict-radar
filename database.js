const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('DATABASE_URL não definida. O Conflict Radar continuará sem persistência até o banco ser configurado.');
}

const pool = connectionString
  ? new Pool({
      connectionString,
      ssl: process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false,
    })
  : null;

async function salvarEvento(evento) {
  if (!pool) return false;

  const query = `
    INSERT INTO events (
      id, title, description, source, url, image, event_date,
      type, country, city, latitude, longitude
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `;

  const values = [
    evento.id,
    evento.titulo,
    evento.descricao || '',
    evento.fonte || '',
    evento.url || null,
    evento.imagem || null,
    evento.data || new Date().toISOString(),
    evento.tipo || 'outro',
    evento.pais || null,
    evento.cidade || null,
    evento.lat ?? null,
    evento.lng ?? null,
  ];

  const result = await pool.query(query, values);
  return result.rowCount > 0;
}

async function carregarEventos(limite = 200) {
  if (!pool) return [];

  const result = await pool.query(
    `SELECT
       id,
       title AS titulo,
       description AS descricao,
       source AS fonte,
       url,
       image AS imagem,
       event_date AS data,
       type AS tipo,
       country AS pais,
       city AS cidade,
       latitude AS lat,
       longitude AS lng
     FROM events
     ORDER BY event_date DESC NULLS LAST, created_at DESC
     LIMIT $1`,
    [limite]
  );

  return result.rows;
}

async function testarBanco() {
  if (!pool) return false;
  await pool.query('SELECT 1');
  return true;
}

module.exports = {
  pool,
  salvarEvento,
  carregarEventos,
  testarBanco,
};
