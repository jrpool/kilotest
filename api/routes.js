/*
  routes.js
  Route metadata for OpenAPI generation. Pairs each Kilotest API operation with its HTTP method, path template, and the request/response schemas from schemas.js. This table supplies the facts that schemas.js cannot express on its own (method, path, path-vs-body placement), mirroring the manual dispatch in index.js and the // GET/POST comments in schemas.js.
*/

// IMPORTS

const {z} = require('zod');
const {
  listIssuesSchema,
  listViolatorsSchema,
  listDiagnosesSchema,
  getReportSchema,
  requestTestSchema,
  requestRetestSchema,
  requestFeatureSchema,
  listReportsResponseSchema,
  listIssuesResponseSchema,
  listViolatorsResponseSchema,
  listDiagnosesResponseSchema,
  getReportResponseSchema,
  requestTestResponseSchema,
  requestRetestResponseSchema,
  requestFeatureResponseSchema
} = require('./schemas');

// ROUTES

module.exports = [
  {
    operationId: 'listReports',
    method: 'get',
    path: '/api/listReports',
    summary: 'List all available reports',
    responseSchema: listReportsResponseSchema
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
    operationId: 'requestTest',
    method: 'post',
    path: '/api/requestTest',
    summary: 'Request that a page be tested',
    bodySchema: z.object(requestTestSchema),
    responseSchema: requestTestResponseSchema
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
    summary: 'Request a new feature or feature improvement',
    bodySchema: z.object(requestFeatureSchema),
    responseSchema: requestFeatureResponseSchema
  }
];
