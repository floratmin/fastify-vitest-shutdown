// Main function to strap everything up
import {action, call, main, Operation, resource, suspend} from 'effection';
import {buildFastify} from './server.ts';
import {Kysely, PostgresDialect} from 'kysely';
import pg from 'pg';
import {FastifyInstance} from 'fastify';
import {fileURLToPath} from 'node:url';


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

if (process.argv[1] === fileURLToPath(import.meta.url)) {

    const {Pool} = pg;

    await main(function* () {

        const {fastify, port} = yield* buildFastify(Pool, Kysely, PostgresDialect);

        yield* startServer(port, fastify, process.env.NODE_ENV ? !(process.env.NODE_ENV !== 'development') : true);

        try {
            yield* suspend();
        } finally {
            fastify.log.info('Started to close all processes.');
        }
    });

}
