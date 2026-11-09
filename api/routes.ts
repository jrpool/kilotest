/*
  routes.ts
  Route metadata for OpenAPI generation. Pairs each Kilotest API operation with its HTTP method, path template, and the request/response schemas from schemas.ts. This table supplies the facts that schemas.ts cannot express on its own (method, path, path-vs-body placement), mirroring the manual dispatch in index.ts and the // GET/POST comments in schemas.ts.
*/

// IMPORTS

import {z} from 'zod';
import {
  listIssuesSchema,
  listViolatorsSchema,
  listDiagnosesSchema,
  getReportSchema,
  listPagesSchema,
  requestNewTestSchema,
  requestRetestSchema,
  requestFeatureSchema,
  awaitTestSchema,
  questionDiagnosisSchema,
  listSitesResponseSchema,
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
} from './schemas.ts';

// ROUTES

export const routes = [
  {
    operationId: 'listSites',
    method: 'get',
    path: '/api/listSites',
    summary: 'List all tested sites',
    responseSchema: listSitesResponseSchema
  },
  {
    operationId: 'listPages',
    method: 'get',
    path: '/api/listPages/{siteID}',
    summary: 'List the tested pages of one site',
    pathParamsSchema: z.object(listPagesSchema),
    responseSchema: listPagesResponseSchema
  },
  {
    operationId: 'listIssues',
    method: 'get',
    path: '/api/listIssues/{reportID}',
    summary: 'List basics about the issues in one report',
    pathParamsSchema: z.object(listIssuesSchema),
    responseSchema: listIssuesResponseSchema
  },
  {
    operationId: 'listViolators',
    method: 'get',
    path: '/api/listViolators/{issueID}/{reportID}',
    summary: 'List elements reported as exhibiting one issue',
    pathParamsSchema: z.object(listViolatorsSchema),
    responseSchema: listViolatorsResponseSchema
  },
  {
    operationId: 'listDiagnoses',
    method: 'get',
    path: '/api/listDiagnoses/{issueID}/{reportID}/{catalogIndex}',
    summary: 'List diagnoses of how one element exhibited one issue',
    pathParamsSchema: z.object(listDiagnosesSchema),
    responseSchema: listDiagnosesResponseSchema
  },
  {
    operationId: 'questionDiagnosis',
    method: 'post',
    path: '/api/questionDiagnosis/{issueID}/{reportID}/{catalogIndex}',
    summary: 'Question a diagnosis',
    pathParamsSchema: z.object({
      issueID: questionDiagnosisSchema.issueID,
      reportID: questionDiagnosisSchema.reportID,
      catalogIndex: questionDiagnosisSchema.catalogIndex
    }),
    bodySchema: z.object({
      engineID: questionDiagnosisSchema.engineID,
      ruleID: questionDiagnosisSchema.ruleID,
      reason: questionDiagnosisSchema.reason
    }),
    responseSchema: questionDiagnosisResponseSchema
  },
  {
    operationId: 'getReport',
    method: 'get',
    path: '/api/getReport/{reportID}',
    summary: 'Get one full report in JSON',
    pathParamsSchema: z.object(getReportSchema),
    responseSchema: getReportResponseSchema
  },
  {
    operationId: 'requestNewTest',
    method: 'post',
    path: '/api/requestNewTest',
    summary: 'Request that a page not yet tested be tested',
    bodySchema: z.object(requestNewTestSchema),
    responseSchema: requestNewTestResponseSchema
  },
  {
    operationId: 'requestRetest',
    method: 'post',
    path: '/api/requestRetest/{reportID}',
    summary: 'Request that a page be retested',
    pathParamsSchema: z.object({
      reportID: requestRetestSchema.reportID
    }),
    bodySchema: z.object({reason: requestRetestSchema.reason}),
    responseSchema: requestRetestResponseSchema
  },
  {
    operationId: 'requestFeature',
    method: 'post',
    path: '/api/requestFeature',
    summary: 'Request a feature improvement or new feature',
    bodySchema: z.object(requestFeatureSchema),
    responseSchema: requestFeatureResponseSchema
  },
  {
    operationId: 'awaitTest',
    method: 'post',
    path: '/api/awaitTest/{reportID}',
    summary: 'Wait for a job ordered via an immediately reviewed test or retest request to complete',
    pathParamsSchema: z.object(awaitTestSchema),
    // No caller-supplied fields beyond the path parameters; an empty body schema (rather
    // than omitting bodySchema) keeps this route consistent with the "every POST route
    // has a bodySchema" invariant the rest of this table and its own test maintain.
    bodySchema: z.object({}),
    responseSchema: awaitTestResponseSchema
  }
];
