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
  requestNewTestSchema,
  requestRetestSchema,
  requestFeatureSchema,
  orderNewTestSchema,
  orderRetestSchema,
  awaitTestSchema,
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
  awaitTestResponseSchema
} from './schemas.ts';

// ROUTES

export const routes = [
  {
    operationId: 'listPages',
    method: 'get',
    path: '/api/listPages',
    summary: 'List all tested pages',
    responseSchema: listPagesResponseSchema
  },
  {
    operationId: 'listIssues',
    method: 'get',
    path: '/api/listIssues/{timeStamp}/{jobID}',
    summary: 'List basics about the issues in one report',
    pathParamsSchema: z.object(listIssuesSchema),
    responseSchema: listIssuesResponseSchema
  },
  {
    operationId: 'listViolators',
    method: 'get',
    path: '/api/listViolators/{issueID}/{timeStamp}/{jobID}',
    summary: 'List elements reported as exhibiting one issue',
    pathParamsSchema: z.object(listViolatorsSchema),
    responseSchema: listViolatorsResponseSchema
  },
  {
    operationId: 'listDiagnoses',
    method: 'get',
    path: '/api/listDiagnoses/{catalogIndex}/{issueID}/{timeStamp}/{jobID}',
    summary: 'List diagnoses of how one element exhibited one issue',
    pathParamsSchema: z.object(listDiagnosesSchema),
    responseSchema: listDiagnosesResponseSchema
  },
  {
    operationId: 'getReport',
    method: 'get',
    path: '/api/getReport/{timeStamp}/{jobID}',
    summary: 'Get one full report in JSON',
    pathParamsSchema: z.object(getReportSchema),
    responseSchema: getReportResponseSchema
  },
  {
    operationId: 'requestNewTest',
    method: 'post',
    path: '/api/requestNewTest',
    summary: 'Request that a page be tested',
    bodySchema: z.object(requestNewTestSchema),
    responseSchema: requestNewTestResponseSchema
  },
  {
    operationId: 'requestRetest',
    method: 'post',
    path: '/api/requestRetest/{timeStamp}/{jobID}',
    summary: 'Request that a page be retested',
    pathParamsSchema: z.object({
      timeStamp: requestRetestSchema.timeStamp,
      jobID: requestRetestSchema.jobID
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
    operationId: 'orderNewTest',
    method: 'post',
    path: '/api/orderNewTest',
    summary: 'Order that a page be tested immediately, without manual approval',
    bodySchema: z.object(orderNewTestSchema),
    responseSchema: orderNewTestResponseSchema
  },
  {
    operationId: 'orderRetest',
    method: 'post',
    path: '/api/orderRetest/{timeStamp}/{jobID}',
    summary: 'Order that a page be retested immediately, without manual approval',
    pathParamsSchema: z.object({
      timeStamp: orderRetestSchema.timeStamp,
      jobID: orderRetestSchema.jobID
    }),
    bodySchema: z.object({reason: orderRetestSchema.reason}),
    responseSchema: orderRetestResponseSchema
  },
  {
    operationId: 'awaitTest',
    method: 'post',
    path: '/api/awaitTest/{timeStamp}/{jobID}',
    summary: 'Wait for a job ordered via orderNewTest or orderRetest to complete',
    pathParamsSchema: z.object(awaitTestSchema),
    // No caller-supplied fields beyond the path parameters; an empty body schema (rather
    // than omitting bodySchema) keeps this route consistent with the "every POST route
    // has a bodySchema" invariant the rest of this table and its own test maintain.
    bodySchema: z.object({}),
    responseSchema: awaitTestResponseSchema
  }
];
