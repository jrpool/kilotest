/*
  generate-lhm.ts
  Regenerates the description and tool entries (description, inputSchema, outputSchema,
  annotations) of lhm.plugin.json from the single sources of truth: content.ts for prose and
  api/schemas.ts (via the same registrations mcp.ts makes) for schemas, and (re)writes a
  "_generated" warning property so editors of the raw JSON see that those fields are
  overwritten on the next generation. version has its own generator, update-versions.ts, which
  copies it from package.json. Every remaining property (author, cloudEndpoint, homepage,
  identifier, name, prompts, resources, tags, and each tool's execution block) has no
  generator anywhere in the repository, so it is left untouched here and is meant to be
  edited by hand.
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
  awaitTestSchema,
  questionDiagnosisSchema,
  listPagesResponseSchema,
  listIssuesResponseSchema,
  listViolatorsResponseSchema,
  listDiagnosesResponseSchema,
  getReportResponseSchema,
  requestNewTestResponseSchema,
  requestRetestResponseSchema,
  requestFeatureResponseSchema,
  awaitTestResponseSchema,
  questionDiagnosisResponseSchema
} from '../api/schemas.ts';

// TYPES

type ZodRawShape = Record<string, z.ZodTypeAny>;

// CONSTANTS

const outputPath = path.join(import.meta.dirname, '..', 'lhm.plugin.json');
const jsonSchemaOptions = {target: 'draft-7' as const, unrepresentable: 'any' as const};
// Edit warning (disregarded on publication per https://market.lobehub.com/s/publish-mcp/references/manifest.md).
const generatedWarning = 'Do not edit the _generated, version, description, or tools property. They are automatically generated from content.ts, api/schemas.ts/mcp.ts, scripts/generate-lhm.ts, and scripts/update-versions.ts.';

// The input and output schemas mcp.ts passes to registerTool for each tool, keyed by tool name, matching mcp.ts's own registerTool calls (mcp.ts remains the source for descriptions and annotations, read at runtime below via createMCPServer).
const toolSchemas: Record<string, {input: ZodRawShape; output?: z.ZodTypeAny}> = {
  getOverview: {input: {}},
  listPages: {input: {}, output: listPagesResponseSchema},
  listIssues: {input: listIssuesSchema, output: listIssuesResponseSchema},
  listViolators: {input: listViolatorsSchema, output: listViolatorsResponseSchema},
  listDiagnoses: {input: listDiagnosesSchema, output: listDiagnosesResponseSchema},
  questionDiagnosis: {input: questionDiagnosisSchema, output: questionDiagnosisResponseSchema},
  getReport: {input: getReportSchema, output: getReportResponseSchema},
  requestNewTest: {input: requestNewTestSchema, output: requestNewTestResponseSchema},
  requestRetest: {input: requestRetestSchema, output: requestRetestResponseSchema},
  requestFeature: {input: requestFeatureSchema, output: requestFeatureResponseSchema},
  awaitTest: {input: awaitTestSchema, output: awaitTestResponseSchema}
};

// FUNCTIONS

// Builds the lhm.plugin.json inputSchema for a tool: like outputSchema below, but LobeHub’sexisting input schemas never carry additionalProperties, so that key is dropped.
const buildInputSchema = (shape: ZodRawShape): Record<string, unknown> => {
  const generated = z.toJSONSchema(z.object(shape), jsonSchemaOptions) as Record<string, unknown>;
  delete generated.additionalProperties;
  const {$schema, ...withoutSchemaKeyword} = generated;
  return {...withoutSchemaKeyword, $schema};
};
// Builds the lhm.plugin.json outputSchema for a tool, reordering keys to match the file’s existing convention ($schema placed just before additionalProperties and definitions).
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
const parsedManifest = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
// Places "_generated" first regardless of where (or whether) it already appears, so it is the first thing a reader of the raw JSON sees. The explicit reassignment after the spread is required even though "_generated" is already a key: were the input file's own (possibly stale) "_generated" value to spread in after it, the spread’s last-write-wins rule would silently keep that stale value in place, even though the key's position stays first either way. Reassigning the other keys below does not move their position, since they already exist on this object.
const manifest = {_generated: generatedWarning, ...parsedManifest};
manifest._generated = generatedWarning;
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
