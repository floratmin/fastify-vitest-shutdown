import {FastifyInstance, FastifyReply, FastifyRequest} from 'fastify';
import {Operation, sleep} from 'effection';

// convenience function for running handler in scope
type ScopedFunction = (request: FastifyRequest, reply: FastifyReply, fastify?: FastifyInstance) => () => Operation<void>;
export const getScopedHandler = (fastify: FastifyInstance, scopeKey: string) => (scopeFunction: ScopedFunction) => (request: FastifyRequest, reply: FastifyReply) => {
    const scope = fastify.scopes.getScope(scopeKey);
    scope.run(scopeFunction(request, reply, fastify))
};

// convenience function for running handler in scope where a rollback operation can be supplied. To prevent rollback the rollback.state has to be set to false
// after successfully finishing all operations
type HandlerWithRollback =(request: FastifyRequest, reply: FastifyReply, interrupted: {state: boolean}, fastify?: FastifyInstance) =>  {try: () => Operation<void>, rollback: () => Operation<void>};
export function getRollbackHandler(fastify: FastifyInstance, scopeKey: string) {
    const scope = fastify.scopes.getScope(scopeKey);
    return (handlerWithRollback: HandlerWithRollback) => (request: FastifyRequest, reply: FastifyReply) => {
        const interrupted = {state: true};
        const rollback = handlerWithRollback(request, reply, interrupted, fastify);
        scope.run(function* () {
            try {
                yield* rollback.try();
            } finally {
                if (interrupted.state) {
                    yield* rollback.rollback();
                }
            }
        });
    }
}

export async function handledScope(fastify: FastifyInstance) {

    const scopedHandler = getScopedHandler(fastify, 'main');

    fastify.get('/scoped', scopedHandler((_, reply) => function* (){
        reply.send({hello: 'user'});
    }));

    const rollbackHandler = getRollbackHandler(fastify, 'main');

    // GET /rollback and stop the server in less than 5 seconds to execute the rollback operation
    fastify.get('/rollback', rollbackHandler((_, reply , rollback) => (
        {
            try: function*(): Operation<void> {
                yield* sleep(5000);
                rollback.state = false;
                reply.send({hello: 'scope with rollback'});
            },
            rollback: function*(): Operation<void> {
                fastify.log.info('Handler was interrupted. Cleaning up...');
                reply.send(new Error('Server Error'));
            },
        })
    ));
}

export async function routesScope(fastify: FastifyInstance) {

    const scope = fastify.scopes.getScope('main');

    // native implementation of the handler with scope
    fastify.get('/scoped/native', (_, reply) => {
        scope.run(function* () {
            reply.send({hello: 'scope native'});
        });
    });
    // native implementation of the handler with rollback
    fastify.get('/rollback/native', (_, reply) => {
        let interrupted = true;
        scope.run(function* (){
            try {
                if (Math.random() < 0.5) {
                    interrupted = false;
                    reply.send({hello: 'scope with rollback native'});
                }
            } finally {
                if (interrupted) {
                    fastify.log.info('Handler was interrupted. Cleaning up...');
                    reply.code(500).send({statusCode: 500, "error": "Internal Server Error", "message": "Server Error"});
                }
            }
        });
    });

}
