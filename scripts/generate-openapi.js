/*
  generate-openapi.js
  Generates openapi.yaml from the Kilotest API route table (api/routes.js) and Zod schemas (api/schemas.js), keeping the OpenAPI document in sync with schemas.js’s single source of truth.
*/

// IMPORTS

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const {createDocument} = require('zod-openapi');
const {license, version} = require('../package.json');
const routes = require('../api/routes');

// CONSTANTS

const outputPath = path.join(__dirname, '..', 'openapi.yaml');

// FUNCTIONS

// Builds the paths object for createDocument from the route table.
const buildPaths = () => {
  const paths = {};
  routes.forEach(route => {
    const {method, path: routePath, summary, pathParamsSchema, bodySchema, responseSchema} = route;
    if (!paths[routePath]) {
      paths[routePath] = {};
    }
    const operation = {
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
      description: 'Kilotest is an ensemble testing and reporting service for front-end web quality. It uses an ensemble of 10 rule engines to test public web pages for front-end quality (accessibility, usability, and standards conformity). Kilotest acts as a web server for human users, an MCP server for AI platforms, and an API for programmatic access. With this API you can request that a page be tested or retested, discover available reports, incrementally retrieve facts from a report: from what reports are available, to what issues were reported in one report, to what elements violated one issue, to what diagnoses rule engines gave for one violation.',
      version,
      license: {
        name: license
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
