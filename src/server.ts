import Fastify, {FastifyBaseLogger, FastifyInstance} from 'fastify';
import {Pool, PoolConfig} from 'pg';
import {action, call, Operation, resource, Scope, useScope} from 'effection';
import {Compilable, CompiledQuery, InferResult, Kysely, PostgresDialect, PostgresPool} from 'kysely';
import {DB} from './db.ts';
import {PoolService} from './interfaces.ts';
import {routesBenchmark} from './routes/routes-benchmark.ts';
import {handledScope, routesScope} from './routes/routes-scope.ts';
import env from 'dotenv';
import {schemas} from './schemas.ts';
import {mainRoutes} from './routes/routes-main.ts';
import fp from 'fastify-plugin';

env.config();


declare module 'fastify' {
    export interface FastifyInstance {
        pool: PoolService;
        db: Kysely<DB>;
        getQueryResults: QueryDatabase;
        scopes: Scopes;
    }
}
export function* buildFastify(pgPool: typeof Pool, kysely: typeof Kysely, postgresDialect: typeof PostgresDialect, logger?: FastifyBaseLogger): Operation<{fastify: FastifyInstance, port: number}> {

    const scope = yield* useScope();

    // instantiate server
    const fastify= yield* call(() => Fastify({
        logger: logger ?? (process.env.LOGGER ? process.env.LOGGER === 'true' : true),
    }));

    // create pool
    const pool = yield* createPool(
        pgPool,
        {
            host: process.env.DATABASE_HOST,
            port: parseInt(process.env.DATABASE_PORT ?? '5432'),
            database: process.env.DATABASE_NAME,
            user: process.env.DATABASE_USER,
            password: process.env.DATABASE_PASSWORD,
        },
        fastify.log,
    );

    decorateFastifyDatabaseFunctions(pool, fastify, kysely, postgresDialect);
    // decorateScope(scope, fastify);
    fastify.register(fastifyPluginScope(scope));

    fastify.addSchema(schemas);

    // register routes
    yield* call(() => fastify.register(routesBenchmark));
    yield* call(() => fastify.register(routesScope));
    yield* call(() => fastify.register(handledScope));
    yield* call(() => fastify.register(mainRoutes));

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
            yield* call(pool.end());
            logger.info('Database pool closed.');
        }
    });
}

type QueryDatabase = <T extends Compilable<any> | CompiledQuery<any>>(compiledQuery: CompiledQuery<T>) => Operation<{rows: InferResult<T>}>;

export function compiledQueryFactory(pool: PoolService): QueryDatabase {
    return <T extends Compilable<any> | CompiledQuery<any>>(compiledQuery: CompiledQuery<T>) => {
        return action(function* compiledQueryAction(resolve, reject) {
            pool.query(compiledQuery.sql, <any []>compiledQuery.parameters, function compiledQueryResults(err, result) {
                if (err) {
                    reject(err);
                } else {
                    resolve(result);
                }
            });
        });
    }
}

export function decorateFastifyDatabaseFunctions(pool: PoolService, fastify: FastifyInstance, kysely: typeof Kysely, postgresDialect: typeof PostgresDialect): void {
    fastify.decorate('pool', pool);
    const db = new kysely<DB>({dialect: new postgresDialect({pool: <PostgresPool>pool})});
    fastify.decorate('db', db);
    const getQueryResults = compiledQueryFactory(pool);
    fastify.decorate('getQueryResults', getQueryResults);
}

export class Scopes {
    #scopes: Record<string, Scope> = {};

    constructor(private fastify: FastifyInstance) {}

    addScope(key: string, scope: Scope) {
        if (this.#scopes[key]) {
            this.fastify.log.error(`Scope of key '${key}' already defined.`);
            throw new Error(`Scope of key '${key}' already defined.`);
        }
        this.#scopes[key] = scope;
    }

    getScope(key: string): Scope {
        const scope = this.#scopes[key];
        if (scope === undefined) {
            this.fastify.log.error(`Scope of key '${key}' not found.`);
            this.fastify.close().then(() => this.fastify.log.info('Closing server because of error in scope.'));
            throw new Error(`Scope of key '${key}' not found.`);
        }
        return scope;
    }

}

export const fastifyPluginScope = (scope: Scope) => fp(
    function(fastify, _, done) {
        let scopes: Scopes | undefined = new Scopes(fastify);
        scopes.addScope('main', scope);
        fastify.decorate('scopes', scopes);
        fastify.addHook('onClose', (instance, done) => {
            scopes = undefined;
            instance.log.info('Scopes released.');
            done();
        });
        done();
    }, {
        name: 'effection-scope-plugin',
    });

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
