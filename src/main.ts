// Main function to strap everything up
import {main, suspend} from 'effection';
import {buildFastify, startServer} from './server.ts';
import {Kysely, PostgresDialect} from 'kysely';
import pg from 'pg';
import {fileURLToPath} from 'node:url';


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
