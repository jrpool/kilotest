/*
  generate-openapi.ts
  Generates openapi.yaml from the Kilotest API route table (api/routes.ts) and Zod schemas (api/schemas.ts), keeping the OpenAPI document in sync with schemas.ts’s single source of truth. Also generates openapi-3.0.yaml, an OpenAPI 3.0.3 conversion for registries whose importers do not accept 3.1 documents (currently the RapidAPI Hub, which is updated via its Hub Listing > Definitions > CI/CD > Import OpenAPI upload).
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
const output30Path = path.join(import.meta.dirname, '..', 'openapi-3.0.yaml');

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
// Converts a generated OpenAPI 3.1 document in place to an OpenAPI 3.0.3
// document: 'const' schemas become single-member 'enum's, type arrays lose
// their 'null' members and gain 'nullable', 'null'-unioned schemas become
// 'nullable', and 3.1-only info fields are removed. Nullable unions whose
// branches cannot be merged into one typed schema gain an extra object-typed
// nullable branch instead, because 3.0 validators require a 'type' wherever
// 'nullable' appears.
const downgrade30 = (document: any) => {
  document.openapi = '3.0.3';
  document.info.license = {
    name: license,
    url: 'https://github.com/jrpool/kilotest/blob/main/LICENSE'
  };
  const refType = (ref: string) => {
    const match = /^#\/components\/schemas\/(.+)$/.exec(ref);
    const target = match?.[1] && document.components?.schemas?.[match[1]];
    return target && typeof target === 'object' ? target.type : null;
  };
  const walk = (node: any): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!node || typeof node !== 'object') {
      return;
    }
    if ('const' in node) {
      node.enum = [node.const];
      delete node.const;
    }
    if (Array.isArray(node.type)) {
      const types = node.type.filter((t: string) => t !== 'null');
      const hasNull = types.length !== node.type.length;
      if (types.length === 1) {
        node.type = types[0];
      }
      else {
        node.oneOf = types.map((t: string) => ({type: t}));
        delete node.type;
      }
      if (hasNull) {
        node.nullable = true;
      }
    }
    else if (node.type === 'null') {
      node.type = 'object';
      node.nullable = true;
    }
    if (Array.isArray(node.anyOf)) {
      const nullIndex = node.anyOf.findIndex(
        (branch: any) => branch && typeof branch === 'object' && branch.type === 'null'
      );
      if (nullIndex !== -1) {
        const others = node.anyOf.filter((_: any, i: number) => i !== nullIndex);
        delete node.anyOf;
        if (others.length === 1 && others[0].$ref) {
          node.allOf = [others[0]];
          const type = refType(others[0].$ref);
          if (type) {
            node.type = type;
          }
          node.nullable = true;
        }
        else if (others.length === 1 && others[0].type) {
          Object.assign(node, others[0]);
          node.nullable = true;
        }
        else {
          node.anyOf = [...others, {type: 'object', nullable: true}];
        }
      }
    }
    for (const value of Object.values(node)) {
      walk(value);
    }
  };
  walk(document);
};
// Generates and writes the openapi.yaml file.
const generate = () => {
  const document = createDocument({
    openapi: '3.1.0',
    info: {
      title: 'Kilotest API',
      description: 'Kilotest is an ensemble testing and reporting service for front-end web quality. It uses an ensemble of 12 rule engines to test web pages for front-end quality (accessibility, usability, and web standards, including HTML, CSS, ARIA, and WCAG). Kilotest acts as a web server for human users, an MCP server for AI platforms, and an API for programmatic access. With this API you can request that a page be tested or retested, discover available reports, incrementally retrieve facts from a report: from what reports are available, to what issues were reported in one report, to what elements violated one issue, to what diagnoses rule engines gave for one violation.',
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
  downgrade30(document);
  fs.writeFileSync(output30Path, yaml.dump(document, {noRefs: true, lineWidth: -1}));
  console.log(`Wrote ${output30Path}`);
};

// EXECUTION

generate();
