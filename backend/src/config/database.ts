import mysql, { FieldPacket, Pool, PoolOptions, QueryResult } from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

type DbPool = Omit<Pool, 'execute' | 'query'> & {
  execute<T extends QueryResult = QueryResult>(
    sql: string,
    values?: any,
  ): Promise<[T, FieldPacket[]]>;
  query<T extends QueryResult = QueryResult>(
    sql: string,
    values?: any,
  ): Promise<[T, FieldPacket[]]>;
};

export type DbExecutor = Pick<DbPool, 'execute'>;

const dbConfig: PoolOptions = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'aps_system',
  port: parseInt(process.env.DB_PORT || '3306'),
  charset: process.env.DB_CHARSET || 'utf8mb4_general_ci',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

export const pool = mysql.createPool(dbConfig) as DbPool;

export default pool;
