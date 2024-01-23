import {beforeEach, describe, expect, it} from 'vitest';
import {Pool, PoolConfig} from 'pg';
import {run, call, sleep} from 'effection';
import {FastifyBaseLogger, FastifyInstance} from 'fastify';
import {buildFastify} from './server.ts';
import {Kysely} from 'kysely';

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



describe('buildFastify', () => {
    it('should build fastify', async () => {
        const logger = {
            info: <string []>[],
            error: <string []>[],
        };
        const log =  new (createLoggerMock(logger))();

        const {
            fastify,
            port,
        } = await run(() => buildFastify(<typeof Pool><unknown>setupPoolMock(), Kysely, <FastifyBaseLogger><unknown>log));

        expect(port).toBe(3000);
        expect(fastify.pool).toBe(1);
        expect(logger.info.slice(0, 3)).toEqual([
            'Server set up.',
            'Closing database pool...',
            'Database pool closed.',
        ]);
    });
});
const KyselyMock = class {
    // @ts-ignore
}

describe('main routes', () => {
    let fastify: FastifyInstance;
    let logs: Partial<Logs>;
    beforeEach(() => {
        logs = {
            info: [],
            warn: [],
            error: [],
            fatal: [],
        };
    });
    it('should GET / [routes]', async () => {
        const log =  new (createLoggerMock(logs))();
        await run(function* () {
            const poolMock = setupPoolMock();
            fastify = (yield* buildFastify(<typeof Pool><unknown>poolMock, <typeof Kysely><unknown>KyselyMock, <FastifyBaseLogger><unknown>log)).fastify;
            fastify.inject({
                method: 'GET',
                url: '/',
            }, (_, response) => {
                expect(response.statusCode).toBe(200);
                expect(response.body).toEqual(JSON.stringify({hello: 'world'}));
            });
            yield* sleep(1);
            yield* call(async () => {
                expect(logs.info?.length).toBe(3);
                expect(logs.info![0]).toBe('Server set up.');
                expect(logs.info!.slice(1).map((log) => Object.keys(log)[0])).toEqual(['req', 'res']);
            });
        });
        expect(logs.info?.length).toBe(5);
        expect(logs.info!.slice(3)).toEqual([
            'Closing database pool...',
            'Database pool closed.',
        ]);
    });
});
