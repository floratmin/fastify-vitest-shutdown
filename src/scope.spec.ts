import {expect} from 'vitest';

import {describe, it, beforeEach} from './test/test-scope.ts';
import {createContext, Scope} from 'effection';

const context = createContext<string>('some-string');

describe('scenario', () => {
    beforeEach(function* (scope: Scope) {
        scope.set(context, 'Hello World');
    });
    it('Does something with context', function*() {
        expect(yield* context).toEqual('Hello World');
    });
});

