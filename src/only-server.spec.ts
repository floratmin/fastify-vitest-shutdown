import {beforeEach, describe, expect, it, vi} from 'vitest';
import {Pool, PoolConfig} from 'pg';
import {createScope, run, Scope} from 'effection';
import {FastifyBaseLogger, FastifyInstance} from 'fastify';
import {buildFastify, compiledQueryFactory, createPool, decorateFastifyDatabaseFunctions, fastifyPluginScope, Scopes, startServer} from './server.ts';
import {PoolService} from './interfaces.ts';
import {CompiledQuery, Kysely, PostgresDialect} from 'kysely';

vi.mock('pg', () => {
    const Pool = vi.fn();
    // @ts-ignore
    Pool.end = vi.fn();
    return {Pool};
});

export function createFastifyMock(logs: Partial<Logs> = {}, devServer = false) {

    return class fastify {
        public log: LoggerMock = new (createLoggerMock(logs))();
        private hooks: Record<string, any[]> = {}

        decorate (pluginName: string, plugin: any){
            if (!(pluginName in this)) {
                // @ts-ignore
                this[pluginName] = plugin;
            }
        }

        async listen(opts: { port: number }) {
            this.log.info(`Listening on port ${opts.port}`);
        }

        addHook(hook: string, func: any) {
            if (this.hooks[hook]) {
                this.hooks[hook]!.push(func);
            } else {
                this.hooks[hook] = [func];
            }
        }

        register(func: any) {
            func(this, undefined, () => {});
        }

        async close(func?: () => void) {
            if (devServer) {
                await new Promise((resolve) => setTimeout(() => resolve(undefined), 1));
            }
            if (func) func();
            if (this.hooks.onClose) {
                this.hooks.onClose.forEach((func) => {
                    func(this, () => {});
                });
            }
        }
    }
}

export type Logs = {
    info: string[];
    error: string[];
    debug: string[];
    fatal: string[];
    warn: string[];
    trace: string[];
};
type LogLevel = keyof Logs;
export function createLoggerMock(logger: Partial<Logs> = {}, logLevel: LogLevel = 'info') {
    const {
        info,
        error,
        debug,
        fatal,
        warn,
        trace,
    } = logger;

    return class Logger {
        public logs = {
            info: info ?? [],
            error: error ?? [],
            debug: debug ?? [],
            fatal: fatal ?? [],
            warn: warn ?? [],
            trace: trace ?? [],
        }
        args: any[];
        #logLevel = logLevel;
        #levels: Record<LogLevel, number> = {
            trace: 10,
            debug: 20,
            info: 30,
            warn: 40,
            error: 50,
            fatal: 60,
        }

        get logLevel() {
            return this.#logLevel;
        }

        set logLevel(logLevel: LogLevel) {
            this.#logLevel = logLevel;
        }

        constructor(...args: any[]) {
            this.args = args;
        }

        private log(log: string, level: LogLevel) {
            if (this.#levels[this.#logLevel] <= this.#levels[level]) {
                this.logs[level].push(log);
            }
        }

        public info(log: string) {
            this.log(log, 'info');
        }
        public error(log: string) {
            this.log(log, 'error');
        }
        public debug(log: string) {
            this.log(log, 'debug');
        }
        public fatal(log: string) {
            this.log(log, 'fatal');
        }
        public warn(log: string) {
            this.log(log, 'warn');
        }
        public trace(log: string) {
            this.log(log, 'trace');
        }
        public child() {
            return new Logger();
        }

    }

}
export interface LoggerMock {
    logs: Logs;
    info: (log: string) => void ;
    error: (log: string) => void ;
    debug: (log: string) => void ;
    fatal: (log: string) => void ;
    warn: (log: string) => void ;
    trace: (log: string) => void ;
    child: () => LoggerMock;
}
export interface PoolMock {
    sql: string[];
    parameters: any[];
    called: number;
    stopped: boolean;
    query: (sql: string, parameters: any[], func: (err: Error | undefined, result: any) => void) => void;
    end: () => void;
    config: PoolConfig;
}

export function setupPoolMock (queryResults: Record<string, {rows: Record<string, any>[]}> = {}, called?: number) {

    return class PoolMock {

        public sql: string[] = [];
        public parameters: any[] = [];
        private queryResults: Record<string, {rows: Record<string, any>[]}> = queryResults;
        public called: number = called ?? 0;
        public stopped = false;

        constructor(public readonly config: PoolConfig = {}) {
            this.called++;
        }

        public query(sql: string, parameters: any[], func: (err: Error | undefined, result: any) => void) {
            if (!this.stopped) {
                this.sql.push(sql);
                this.parameters.push(parameters);
                const results = this.queryResults[sql] ?? {rows: [{result: 'queryResult'}]};
                func(undefined, results);
            } else {
                throw new Error('Database connection closed.');
            }
        }

        end() {
            this.stopped = true;
        }

    }
}

describe('createPool', () => {
    let logger: LoggerMock;
    beforeEach(() => {
        logger = <LoggerMock>new (createLoggerMock())();
        vi.clearAllMocks();
    });
    it('Should create a pool and close it immediately after invoking it with run', async function () {

        const PoolMock = setupPoolMock({});

        const pool = await run(function* () {
            const pool =  yield* createPool(<typeof Pool><unknown>PoolMock, {}, <FastifyBaseLogger><unknown>logger);
            expect(logger.logs.info).toEqual([]);
            return <PoolMock><unknown>pool;
        });
        expect(pool.called).toBe(1);
        expect(logger.logs.info).toEqual([
            'Closing database pool...',
            'Database pool closed.',
        ]);
    });

    // example with mocked Pool
    it('Should keep pool open with operation', async function () {
        const {Pool} = await import('pg');
        Pool.prototype.end = vi.fn().mockReturnValue(() => undefined);
        await run(function* () {
            function* getPool(config: PoolConfig, logger: FastifyBaseLogger) {
                return yield* createPool(Pool, config, logger);
            }
            yield* getPool({}, <FastifyBaseLogger><unknown>logger);
            expect(Pool).toBeCalledTimes(1);
            expect(logger.logs.info).toEqual([]);
        });
    });
});

describe('startServer', () => {
    let logger: Partial<Logs>;
    beforeEach(() => {
        logger = {
            info: [],
        };
    });
    it('Should start a server', async () => {
        const fastify = <FastifyInstance><unknown>new (createFastifyMock(logger))();
        await run(function* () {
            yield* startServer(3000, fastify, false);
            expect(logger.info).toEqual([
                'Listening on port 3000',
            ]);
        });
        expect(logger.info).toEqual([
            'Listening on port 3000',
            'Shutting down server...'
        ]);
    });
    it('Should start a dev server, which does not wait for closeListener', async() => {
        const fastify = <FastifyInstance><unknown>new (createFastifyMock(logger, true))();
        await run(function* () {
            yield* startServer(3000, fastify, true);
            expect(logger.info).toEqual([
                'Listening on port 3000',
            ]);
        });
        expect(logger.info).toEqual([
            'Listening on port 3000',
        ]);
    });
});

describe('compiledQueryFactory', () => {
   it('Should create a function to query database with compiled queries', async () => {
       const PoolMock = setupPoolMock({'SELECT': {rows: [{result: 'queryResult'}]}});
       const pool = new PoolMock();
       const databaseQuerier = compiledQueryFactory(<PoolService><unknown>pool);
       const databaseQuery = databaseQuerier(<CompiledQuery<any>><unknown>{sql: 'SELECT', parameters: [1]});
       const result = <{rows: {result: string}[]}>await run(() => databaseQuery);
       expect(result.rows[0]?.result).toBe('queryResult');
       expect(pool.sql).toEqual(['SELECT']);
       expect(pool.parameters).toEqual([[1]]);
   });
});

describe('decorateFastifyDatabaseFunctions', () => {
    it('should decorate fastify with database functions', async () => {
        const spy: {dialect: any, plugins: Record<string, any>, pool?: PoolMock} = {
            dialect: undefined,
            plugins: {},
            pool: undefined,
        };
        const PostgresDialectMock = <typeof PostgresDialect><unknown>class {
            constructor(private config: {pool: PoolMock}) {
                spy.pool = this.config.pool;
            }

        };
        const KyselyMock = <typeof Kysely><unknown>class {
            constructor(private config: {dialect: typeof PostgresDialect}) {
                spy.dialect = this.config.dialect;
            }
        }
        const PoolMock = setupPoolMock({'SELECT': {rows: [{result: 'queryResult'}]}});
        const pool = new PoolMock();
        const fastify = <FastifyInstance><unknown>new (createFastifyMock())();

        decorateFastifyDatabaseFunctions(<Pool><unknown>pool, fastify, <typeof Kysely><unknown>KyselyMock, <typeof PostgresDialect><unknown>PostgresDialectMock);
        expect(pool.called).toEqual(1);
        expect(spy.dialect).toEqual(new PostgresDialectMock({pool: <PoolService><unknown>pool}));
        expect(pool.sql).toEqual([]);
        expect(pool.parameters).toEqual([]);
        expect(fastify.pool).toEqual(pool);
        expect(spy.pool).toEqual(pool);
        expect(fastify.db).toEqual(new KyselyMock({dialect: new PostgresDialectMock({pool: <PoolService><unknown>pool})}));
        expect(fastify.getQueryResults.toString()).toBe(compiledQueryFactory(<PoolService><unknown>pool).toString());
        const result = await(run(() => fastify.getQueryResults(<CompiledQuery><unknown>{sql: 'SELECT', parameters: [0]})));
        expect(result).toEqual({rows: [{result: 'queryResult'}]});
        expect(pool.sql).toEqual(['SELECT']);
        expect(pool.parameters).toEqual([[0]]);
    });
});

describe('Scopes', () => {
    const fastifyMock = createFastifyMock();
    const fastify = <FastifyInstance><unknown>(new fastifyMock());
    it('should create scopes', () => {
        const [scope] = createScope();
        const scopes = new Scopes(fastify);
        scopes.addScope('main', scope);
        expect(scopes.getScope('main')).toBe(scope);
    });
    it('should throw when scope already created', () => {
        const [scope] = createScope();
        const scopes = new Scopes(fastify);
        scopes.addScope('main', scope);
        expect(() => scopes.addScope('main', scope)).toThrowError(`Scope of key 'main' already defined.`);
    });
    it('should throw when scope is not found', () => {
        const [scope] = createScope();
        const scopes = new Scopes(fastify);
        scopes.addScope('main', scope);
        expect(() => scopes.getScope('notDefined')).toThrowError(`Scope of key 'notDefined' not found.`);
    });
});

describe('fastifyPluginScope', () => {
    it('should decorate scope', async () => {

        const logger: Partial<Logs> = {
            info: [],
        }
        const fastify = <FastifyInstance><unknown>new (createFastifyMock(logger))();

        class ScopeMock {}

        const scope = new ScopeMock();
        const plugin = fastifyPluginScope(<Scope>scope);
        await fastify.register(plugin);
        expect(fastify.scopes).toBeInstanceOf(Scopes);
        expect(fastify.scopes.getScope('main')).toEqual(scope);
        await fastify.close();
        expect(logger.info).toEqual([
            'Scopes released.',
        ]);
    });
});

describe('buildFastify', () => {
    it('should build fastify', async () => {
        const logger = {
            info: <string []>[],
            error: <string []>[],
        };
        const loggerMock = new (createLoggerMock({info: logger.info}))();

        const {
            fastify,
            port,
        } = await run(() => buildFastify(<typeof Pool><unknown>setupPoolMock(), Kysely, PostgresDialect, <FastifyBaseLogger><unknown>loggerMock));

        expect(port).toBe(3000);
        expect(fastify.scopes).toBeInstanceOf(Scopes);
        expect(fastify.scopes.getScope('main')).toBeDefined();
        expect((<PoolMock><unknown>fastify.pool).config).toEqual({
            host: '0.0.0.0',
            port: 5433,
            database: 'fastify',
            user: 'app',
            password: 'password',
        });
        expect((<PoolMock><unknown>fastify.pool).stopped).toBeTruthy();
        expect(fastify.db).toBeInstanceOf(Kysely);
        expect(fastify.getQueryResults).toBeDefined();
        expect(logger.info.slice(0, 3)).toEqual([
            'Server set up.',
            'Closing database pool...',
            'Database pool closed.',
        ]);
    });
});

// describe('startServer', () => {
//     it('starts the server', async () => {
//         const logs: Partial<Logs> = {
//             info: [],
//         }
//         const fastify = new (createFastifyMock(logs))();
//         await run(function* () {
//             yield* startServer(3000, <FastifyInstance><unknown>fastify, false);
//             expect(logs.info).toEqual([
//                 'Listening on port 3000',
//             ]);
//         });
//         expect(logs.info).toEqual([
//             'Listening on port 3000',
//             'Shutting down server...',
//         ]);
//     });
//     it('starts the devServer', async () => {
//         const logs: Partial<Logs> = {
//             info: [],
//         }
//         const fastify = new (createFastifyMock(logs, true))();
//         await run(function* () {
//             yield* startServer(3000, <FastifyInstance><unknown>fastify, true);
//             expect(logs.info).toEqual([
//                 'Listening on port 3000',
//             ]);
//         });
//         expect(logs.info).toEqual([
//             'Listening on port 3000',
//         ]);
//     });
// });
