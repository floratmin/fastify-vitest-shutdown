import {FastifyInstance} from 'fastify';
import {InferResult} from 'kysely';

export async function routesBenchmark(fastify: FastifyInstance) {
    const scope = fastify.scopes.getScope('main');

    // run without scope and without db
    fastify.get('/benchmark/no/no', async () => {
        return {hello: 'user'};
    });
    // run with scope and without db
    fastify.get('/benchmark/sc/no', (_, reply) => {
        scope.run(function* () {
            reply.send({hello: 'user'});
        });
    });
    // run without scope and with db
    fastify.get('/benchmark/no/db', async () => {
        const user = await fastify.db.selectFrom('users').selectAll().executeTakeFirst();
        return {hello: user?.name};
    });
    // run with scope and with db
    fastify.get('/benchmark/sc/db', (_, reply) => {
        scope.run(function* () {
            const userQuery = fastify.db.selectFrom('users').selectAll().compile();
            const users: InferResult<typeof userQuery> = (yield* fastify.getQueryResults(userQuery)).rows;
            reply.send({hello: users[0]?.name});
        });
    });

}

