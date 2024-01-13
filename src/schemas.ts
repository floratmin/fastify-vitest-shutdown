import {JSONSchema7} from 'json-schema-to-ts/lib/types/definitions';

export const hello= {
    $id: 'http://hello-schema.com',
    title: 'Hello Schema',
    type: 'object',
    required: ['hello'],
    properties: {
        hello: {
            type: 'string',
        },
    },
    additionalProperties: false,
} as const satisfies JSONSchema7;


export const schemas = {
    $id: 'http://schemas.com/',
    title: 'Parent schema',
    definitions: {
        hello,
    },
} as const satisfies JSONSchema7;
