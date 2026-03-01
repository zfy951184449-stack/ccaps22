interface MysqlLikeError {
  code?: string;
  sqlMessage?: string;
  message?: string;
}

export const isMissingTableError = (error: unknown): boolean => {
  const mysqlError = error as MysqlLikeError | undefined;
  return mysqlError?.code === 'ER_NO_SUCH_TABLE';
};

export const extractMissingTableName = (error: unknown): string | null => {
  const mysqlError = error as MysqlLikeError | undefined;
  const source = mysqlError?.sqlMessage ?? mysqlError?.message ?? '';
  const match = source.match(/'[^']+\.([^']+)'/);
  return match?.[1] ?? null;
};
