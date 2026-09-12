/*
  generate-openapi.ts
  Generates openapi.yaml from the Kilotest API route table (api/routes.ts) and Zod schemas (api/schemas.ts), keeping the OpenAPI document in sync with schemas.ts’s single source of truth.
*/

// IMPORTS

import fs from 'node:fs';
import path from 'node:path';
import * as yaml from 'js-yaml';
import {createDocument} from 'zod-openapi';
import pkg from '../package.json' with {type: 'json'};
import {routes} from '../api/routes.ts';
import {version} from '../api/version.ts';

// CONSTANTS

const {license} = pkg;
const outputPath = path.join(import.meta.dirname, '..', 'openapi.yaml');

// FUNCTIONS

// Builds the paths object for createDocument from the route table.
const buildPaths = () => {
  const paths: Record<string, any> = {};
  routes.forEach(route => {
    const {method, path: routePath, summary, pathParamsSchema, bodySchema, responseSchema} = route;
    if (!paths[routePath]) {
      paths[routePath] = {};
    }
    const operation: any = {
      operationId: route.operationId,
      summary,
      responses: {
        '200': {
          description: summary,
          content: {
            'application/json': {schema: responseSchema}
          }
        }
      }
    };
    if (pathParamsSchema) {
      operation.requestParams = {path: pathParamsSchema};
    }
    if (bodySchema) {
      operation.requestBody = {
        content: {'application/json': {schema: bodySchema}}
      };
    }
    paths[routePath][method] = operation;
  });
  return paths;
};
// Generates and writes the openapi.yaml file.
const generate = () => {
  const document = createDocument({
    openapi: '3.1.0',
    info: {
      title: 'Kilotest API',
      description: 'Kilotest is an ensemble testing and reporting service for front-end web quality. It uses an ensemble of 12 rule engines to test public web pages for front-end quality (accessibility, usability, and standards conformity). Kilotest acts as a web server for human users, an MCP server for AI platforms, and an API for programmatic access. With this API you can request that a page be tested or retested, discover available reports, incrementally retrieve facts from a report: from what reports are available, to what issues were reported in one report, to what elements violated one issue, to what diagnoses rule engines gave for one violation.',
      version,
      license: {
        name: license,
        identifier: license
      },
      contact: {
        name: 'Kilotest',
        url: 'https://github.com/jrpool/kilotest',
        email: 'info@kilotest.com'
      }
    },
    servers: [
      {url: 'https://kilotest.com', description: 'Kilotest production server'}
    ],
    security: [],
    paths: buildPaths()
  });
  fs.writeFileSync(outputPath, yaml.dump(document, {noRefs: true, lineWidth: -1}));
  console.log(`Wrote ${outputPath}`);
};

// EXECUTION

generate();
