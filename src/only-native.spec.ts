import {beforeEach, describe, expect, it, afterEach} from 'vitest';
import Fastify, {FastifyInstance} from 'fastify';

describe('Test native server', () => {
   async function buildFastify () {
     const fastify = await Fastify();

     fastify.get('/', function (_, reply) {
       reply.send({ hello: 'world' })
     });

     return fastify
   }
   let fastify: FastifyInstance;
   beforeEach(async () => {
       fastify = await buildFastify();
   })
   it('should work', async () => {
       fastify.inject({
           method: 'GET',
           url: '/',
       }, (_, response) => {
           expect(response.statusCode).toBe(200);
       });
       await new Promise((resolve) => setTimeout(() => resolve(undefined), 1));
   });
   afterEach(async () => {
       await fastify.close();
   });
});

