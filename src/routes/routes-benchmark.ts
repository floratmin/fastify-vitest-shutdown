import {FastifyInstance} from 'fastify';

export async function routesBenchmark(fastify: FastifyInstance) {
    fastify.get('/benchmark/no/no', async () => {
        return {hello: 'user'};
    });
}

