import {expect, describe, it, beforeEach} from 'vitest';
import {buildFastify} from '../server.ts';
import {Pool} from 'pg';
import {Kysely, PostgresDialect} from 'kysely';
import {setupPoolMock, createLoggerMock, Logs, PoolMock} from '../only-server.spec.ts';
import {FastifyBaseLogger, FastifyInstance} from 'fastify';
import {call, run, sleep} from 'effection';

const PostgresDialectMock = <typeof PostgresDialect><unknown>class {
    // @ts-ignore
    constructor(private config: {pool: PoolMock}) {
    }

};
const KyselyMock = <typeof Kysely><unknown>class {
    // @ts-ignore
    constructor(private config: {dialect: typeof PostgresDialect}) {
    }
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
        if (!process.env.VITEST) {
            await run(function* () {
                const poolMock = setupPoolMock();
                const logger = new (createLoggerMock(logs))();
                // const postgresDialect = new PostgresDialectMock({pool: <PoolMock>poolMock})
                fastify = (yield* buildFastify(<typeof Pool><unknown>poolMock, KyselyMock, PostgresDialectMock, <FastifyBaseLogger><unknown>logger)).fastify;
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
        }
    });
});
