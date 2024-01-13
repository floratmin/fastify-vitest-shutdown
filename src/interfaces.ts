import {PoolClient, QueryResult} from 'pg';

interface QueryService {
    (query: string, values?: any[]): Promise<QueryResult>;
    (query: string, values: any[], func: (err: Error, result: any) => void): void;
}
// The interface for a postgres database pool
export interface PoolService {
    connect(): Promise<PoolClient>;
    query: QueryService;
    end(): Promise<void>;
}
