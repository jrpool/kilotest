/*
  generate-lhm.ts
  Regenerates the description and tool entries (description, inputSchema, outputSchema,
  annotations) of lhm.plugin.json from the single sources of truth: content.ts for prose and
  api/schemas.ts (via the same registrations mcp.ts makes) for schemas. Everything else in
  lhm.plugin.json (author, cloudEndpoint, homepage, identifier, name, prompts, resources,
  tags, version, and each tool's execution block) is left untouched, because it has no
  canonical source elsewhere in the repository; version is kept in sync separately by
  update-versions.ts.
*/

// IMPORTS

import fs from 'node:fs';
import path from 'node:path';
import {z} from 'zod';
import {createMCPServer} from '../mcp.ts';
import {collectionDescription} from '../content.ts';
import {
  listIssuesSchema,
  listViolatorsSchema,
  listDiagnosesSchema,
  getReportSchema,
  requestNewTestSchema,
  requestRetestSchema,
  requestFeatureSchema,
  orderNewTestSchema,
  orderRetestSchema,
  awaitTestSchema,
  reportDisagreementSchema,
  listPagesResponseSchema,
  listIssuesResponseSchema,
  listViolatorsResponseSchema,
  listDiagnosesResponseSchema,
  getReportResponseSchema,
  requestNewTestResponseSchema,
  requestRetestResponseSchema,
  requestFeatureResponseSchema,
  orderNewTestResponseSchema,
  orderRetestResponseSchema,
  awaitTestResponseSchema,
  reportDisagreementResponseSchema
} from '../api/schemas.ts';

// TYPES

type ZodRawShape = Record<string, z.ZodTypeAny>;

// CONSTANTS

const outputPath = path.join(import.meta.dirname, '..', 'lhm.plugin.json');
const jsonSchemaOptions = {target: 'draft-7' as const, unrepresentable: 'any' as const};

// The input and output schemas mcp.ts passes to registerTool for each tool, keyed by tool
// name, matching mcp.ts's own registerTool calls exactly (mcp.ts remains the source for
// descriptions and annotations, read at runtime below via createMCPServer).
const toolSchemas: Record<string, {input: ZodRawShape; output?: z.ZodTypeAny}> = {
  getKilotestOverview: {input: {}},
  listPages: {input: {}, output: listPagesResponseSchema},
  listIssues: {input: listIssuesSchema, output: listIssuesResponseSchema},
  listViolators: {input: listViolatorsSchema, output: listViolatorsResponseSchema},
  listDiagnoses: {input: listDiagnosesSchema, output: listDiagnosesResponseSchema},
  getReport: {input: getReportSchema, output: getReportResponseSchema},
  requestNewTest: {input: requestNewTestSchema, output: requestNewTestResponseSchema},
  requestRetest: {input: requestRetestSchema, output: requestRetestResponseSchema},
  requestFeature: {input: requestFeatureSchema, output: requestFeatureResponseSchema},
  reportDisagreement: {input: reportDisagreementSchema, output: reportDisagreementResponseSchema},
  orderNewTest: {input: orderNewTestSchema, output: orderNewTestResponseSchema},
  orderRetest: {input: orderRetestSchema, output: orderRetestResponseSchema},
  awaitTest: {input: awaitTestSchema, output: awaitTestResponseSchema}
};

// FUNCTIONS

// Builds the lhm.plugin.json inputSchema for a tool: like outputSchema below, but LobeHub's
// existing input schemas never carry additionalProperties, so that key is dropped.
const buildInputSchema = (shape: ZodRawShape): Record<string, unknown> => {
  const generated = z.toJSONSchema(z.object(shape), jsonSchemaOptions) as Record<string, unknown>;
  delete generated.additionalProperties;
  const {$schema, ...withoutSchemaKeyword} = generated;
  return {...withoutSchemaKeyword, $schema};
};
// Builds the lhm.plugin.json outputSchema for a tool, reordering keys to match the file's
// existing convention ($schema placed just before additionalProperties and definitions).
const buildOutputSchema = (schema: z.ZodTypeAny): Record<string, unknown> => {
  const generated = z.toJSONSchema(schema, jsonSchemaOptions) as Record<string, unknown>;
  const {$schema, additionalProperties, definitions, ...rest} = generated;
  return {
    ...rest,
    ...($schema !== undefined ? {$schema} : {}),
    ...(additionalProperties !== undefined ? {additionalProperties} : {}),
    ...(definitions !== undefined ? {definitions} : {})
  };
};

// EXECUTION

const server = createMCPServer();
const registeredTools = (server as unknown as {_registeredTools: Record<string, {description: string; annotations: unknown}>})._registeredTools;
const manifest = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
manifest.description = collectionDescription;
manifest.tools = manifest.tools.map((tool: {name: string; execution: unknown}) => {
  const registered = registeredTools[tool.name];
  const schemas = toolSchemas[tool.name];
  if (!registered || !schemas) {
    throw new Error(`No registration or schema mapping found for lhm.plugin.json tool "${tool.name}"`);
  }
  return {
    name: tool.name,
    description: registered.description,
    inputSchema: buildInputSchema(schemas.input),
    ...(schemas.output ? {outputSchema: buildOutputSchema(schemas.output)} : {}),
    annotations: registered.annotations,
    execution: tool.execution
  };
});
fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${outputPath}`);
