import {expect, describe, it} from 'vitest';
import {createLoggerMock, Logs} from './server.spec.ts';
import {FastifyInstance} from 'fastify';
import {run} from 'effection';
import {LoggerMock} from './server.spec.ts';
import {startServer} from './main.ts';

function createFastifyMock(logs: Partial<Logs> = {}, devServer = false) {

    return class fastify {
        public log: LoggerMock = new (createLoggerMock(logs))();

        async listen(opts: {port: number}) {
            this.log.info(`Listening on port ${opts.port}`);
        }

        async close(func: () => void) {
            if (devServer) {
                await new Promise((resolve) => setTimeout(() => resolve(undefined), 1));
            }
            func();
        }
    }
}

describe('startServer', () => {
    it('starts the server', async () => {
        const logs: Partial<Logs> = {
            info: [],
        }
        const fastify = new(createFastifyMock(logs))();
        await run(function* () {
            yield* startServer(3000, <FastifyInstance><unknown>fastify, false);
            expect(logs.info).toEqual([
                'Listening on port 3000',
            ]);
        });
        expect(logs.info).toEqual([
            'Listening on port 3000',
            'Shutting down server...',
        ]);
    });
    it('starts the devServer', async () => {
        const logs: Partial<Logs> = {
            info: [],
        }
        const fastify = new(createFastifyMock(logs, true))();
        await run(function* () {
            yield* startServer(3000, <FastifyInstance><unknown>fastify, true);
            expect(logs.info).toEqual([
                'Listening on port 3000',
            ]);
        });
        expect(logs.info).toEqual([
            'Listening on port 3000',
        ]);
    });
});
