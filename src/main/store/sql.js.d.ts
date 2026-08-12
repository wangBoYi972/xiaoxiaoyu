declare module 'sql.js' {
  interface SqlJsStatic {
    Database: new (data?: ArrayLike<number> | Buffer | null) => Database;
  }

  interface Database {
    run(sql: string, params?: any[]): void;
    exec(sql: string): Array<{ columns: string[]; values: any[][] }>;
    prepare(sql: string): Statement;
    export(): Uint8Array;
    close(): void;
  }

  interface Statement {
    bind(params?: any[]): boolean;
    step(): boolean;
    getAsObject(params?: Record<string, unknown>): Record<string, any>;
    get(): any[];
    free(): boolean;
    reset(): void;
  }

  export default function initSqlJs(config?: Record<string, unknown>): Promise<SqlJsStatic>;
  export { SqlJsStatic, Database, Statement };
}
