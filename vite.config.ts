/// <reference types="vite/client" />
import {defineConfig} from 'vitest/config';
import {VitePluginNode} from 'vite-plugin-node';

export default defineConfig({
    server: {
        host: 'localhost',
        port: 3000,
        fs: {
            allow: [],
        },
    },
    preview: {
        port: 3000,
    },
    build: {
        outDir: 'dist',
        target: 'esnext',
        minify: 'esbuild',
        lib: {
            // Could also be a dictionary or array of multiple entry points.
            entry: 'src/main.ts',
            name: 'main',
            fileName: 'main',
            // Change this to the formats you want to support.
            // Don't forget to update your package.json as well.
            formats: ['es'],
        },
    },
    plugins: [
        VitePluginNode({
            adapter: 'fastify',
            appPath: './src/main.ts',
            exportName: 'serverApp',
        }),
    ],
    test: {
        include: [
            'src/**/*.{test,spec}.ts',
        ],
        environment: 'node',
        // deps: {
        //     inline: [/@effection\/vitest/],
        // }
    },
});
