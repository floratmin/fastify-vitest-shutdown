import Fastify, {FastifyBaseLogger, FastifyInstance} from 'fastify';
import {Pool, PoolConfig} from 'pg';
import {action, call, Operation, resource} from 'effection';
import {Kysely} from 'kysely';
import {PoolService} from './interfaces.ts';
import {routesBenchmark} from './routes/routes-benchmark.ts';
import {routesScope} from './routes/routes-scope.ts';
import {schemas} from './schemas.ts';
import {mainRoutes} from './routes/routes-main.ts';

declare module 'fastify' {
    export interface FastifyInstance {
        pool: number;
    }
}
export function* buildFastify(pgPool: typeof Pool, kysely: typeof Kysely, logger?: FastifyBaseLogger): Operation<{fastify: FastifyInstance, port: number}> {


    // instantiate server
    const fastify = Fastify({
        logger: logger ?? (process.env.LOGGER ? process.env.LOGGER === 'true' : true),
    });

    // create pool
    yield* createPool(
        pgPool,
        {
            host: '0.0.0.0',
            port: 5433,
            database: 'fastify',
            user: 'app',
            password: 'password',
        },
        fastify.log,
    );

    fastify.decorate('pool', 1);

    fastify.addSchema(schemas);

    // register routes
    fastify.register(routesBenchmark);
    fastify.register(routesScope);
    fastify.register(mainRoutes);

    const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;


    fastify.log.info('Server set up.');

    return {fastify, port};
}
// Create postgres database pool
export function createPool(poolClass: typeof Pool, config: PoolConfig, logger: FastifyBaseLogger): Operation<PoolService> {
    return resource(function* (provide) {
        let pool = new poolClass(config);
        try {
            yield* provide(pool);
        } finally {
            logger.info('Closing database pool...');
            yield* call(() => pool.end());
            logger.info('Database pool closed.');
        }
    });
}

// Start Fastify server
export function startServer(port: number, fastify: FastifyInstance, devServer: boolean): Operation<undefined> {
    return resource(function* (provide) {
        yield* call(fastify.listen({port}));
        try {
            yield* provide(undefined);
        } finally {
            yield* action(function* (resolve, reject) {
                try {
                    fastify.close(() => {
                        fastify.log.info('Shutting down server...');
                        resolve();
                    });
                    devServer && resolve();
                } catch (err: unknown) {
                    const error = err instanceof Error ? err : new Error(`An exception occurred when shutting down the server. ${err}`);
                    reject(error);
                }
            });
        }
    });
}
