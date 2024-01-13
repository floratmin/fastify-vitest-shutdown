# Fastify with Effection, Typescript, Vitest and Kysely

### Run dev server
- Start database: `pnpm run startdb`
- Start server: `pnpm run dev`
- Hit `GET /rollback/native` several times and look at the server logs

- We can test now how `effection` handles a shutdown of the server with the following steps:
  - `GET /rollback`
  - stop server in less than 5 seconds
  - look at server response and fastify log

This operation will take much longer if we hit a route with a 
database query (like `GET /benchmark/no/db`) before.

### Run benchmark (requires ApacheBench to be installed)

1. Start database: `pnpm run startdb`
2. Start server: `pnpm run bench:server`
3. Run benchmark: `pnpm run bench:start`
