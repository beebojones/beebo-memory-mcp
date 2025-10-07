import pkg from "pg";
import dotenv from "dotenv";

dotenv.config(); // loads .env file

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // required by Render
});

export default pool;
