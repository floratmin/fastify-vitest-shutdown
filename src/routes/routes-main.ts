import {FastifyInstance} from 'fastify';

export async function mainRoutes(fastify: FastifyInstance) {

    fastify.get('/', async () => ({hello: 'world'}));

    fastify.get('/schema', {
        handler: ()  => {
            return {hello: 'world'};
        },
        schema: {
            tags: ['Hello'],
            description: 'Get Greeting',
            response: {
                '2xx': {
                    $ref: 'http://hello-schema.com#',
                }
            },
        },
    });

}
