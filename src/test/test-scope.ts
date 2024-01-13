import {
  createScope,
  type Operation,
  type Scope,
  suspend,
} from 'effection';

export interface TestScope {
    runSetup(op: (scope: Scope) => Operation<void>): Promise<void>;
    runTest(op: () => Operation<void>): Promise<void>;
    teardown(): Promise<void>;
}

export function createTestScope(): TestScope {
    let error: Error | undefined;

    let [scope, destroy] = createScope();

    return {
        runSetup(op: (scope: Scope) => Operation<void>): Promise<void> {
            return new Promise<void>((resolve) => {
                scope.run(function* () {
                    try {
                        yield* op(scope);
                        resolve();
                        yield* suspend();
                    } catch (e) {
                        error = <Error>e;
                    }
                });
            });
        },
        runTest: scope.run,
        async teardown() {
            await destroy();
            if (error) {
                throw error;
            }
        }
    }
}

import * as vitest from 'vitest';

let scope: TestScope | undefined;

function describeWithScope(name: string | Function, factory?: vitest.SuiteFactory<{}>): vitest.SuiteCollector<{}> {
    return vitest.describe(name, () => {
        vitest.beforeEach(() => {
            if (!scope) {
                scope = createTestScope();
            }
        });
        vitest.afterEach(async () => await scope?.teardown());
        if (factory && typeof factory === 'function') {
            (<Function>factory)();
        }
    });
}

describeWithScope.only = vitest.describe.only;
describeWithScope.ignore = vitest.describe.skip;

export const describe  = <typeof vitest.describe><unknown>describeWithScope;

export function beforeEach(op: (scope: Scope) => Operation<void>): void {
    vitest.beforeEach(() => scope!.runSetup(op));
}

export function it(desc: string, op?: () => Operation<void>): void {
    if (op) {
        return vitest.it(desc, () => scope?.runTest(op));
    } else {
        return vitest.it.skip(desc, () => {});
    }
}

it.only = function only(desc: string, op?: () => Operation<void>): void {
    if (op) {
        return vitest.it.only(desc, () => scope!.runTest(op));
    } else {
        return vitest.it.skip(desc, () => {});
    }
};
