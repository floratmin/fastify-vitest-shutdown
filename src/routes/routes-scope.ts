import {FastifyInstance} from 'fastify';
export async function routesScope(fastify: FastifyInstance) {

    fastify.get('/scope', () => ({hello: 'scope'}));
}
