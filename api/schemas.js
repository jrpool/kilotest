/*
  schemas.js
  Zod input schemas shared by mcp.js (MCP tool inputSchema) and an openapi.yaml generation script. Descriptions are the single source of truth for parameter documentation.
*/

// IMPORTS

const {z} = require('zod');

// REQUEST SCHEMAS

// listIssues: GET /api/listIssues/{timeStamp}/{jobID}
exports.listIssuesSchema = {
  timeStamp: z.string().describe('Timestamp of the report in YYMMDDTHHmm format (example: 260503T0432)'),
  jobID: z.string().describe('Job identifier of the report (example: x9z)')
};

// listViolators: GET /api/listViolators/{issueID}/{timeStamp}/{jobID}
exports.listViolatorsSchema = {
  issueID: z.string().describe('Issue identifier (example: contrastPoor)'),
  timeStamp: z.string().describe('Timestamp of the report in YYMMDDTHHmm format (example: 260503T0432)'),
  jobID: z.string().describe('Job identifier of the report (example: x9z)')
};

// listDiagnoses: GET /api/listDiagnoses/{catalogIndex}/{issueID}/{timeStamp}/{jobID}
exports.listDiagnosesSchema = {
  catalogIndex: z.string().describe('Identifier of the issue-exhibiting element in the catalog of elements on the page (example: 372)'),
  issueID: z.string().describe('Issue identifier (example: contrastPoor)'),
  timeStamp: z.string().describe('Timestamp of the report in YYMMDDTHHmm format (example: 260503T0432)'),
  jobID: z.string().describe('Job identifier of the report (example: x9z)')
};

// getReport: GET /api/getReport/{timeStamp}/{jobID}
exports.getReportSchema = {
  timeStamp: z.string().describe('Timestamp of the report in YYMMDDTHHmm format (example: 260503T0432)'),
  jobID: z.string().describe('Job identifier of the report (example: x9z)')
};

// requestTest: POST /api/requestTest
exports.requestTestSchema = {
  description: z.string().describe('10- to 100-character description of the page conforming to the naming convention used in the listReports output'),
  URL: z.string().describe('12- to 300-character URL of the page, including the https:// scheme and any query'),
  reason: z.string().describe('20- to 100-character reason why the page should be tested')
};

// requestRetest: POST /api/requestRetest/{timeStamp}/{jobID}
exports.requestRetestSchema = {
  timeStamp: z.string().describe('Timestamp of the latest report about the page in YYMMDDTHHmm format (example: 260503T0432)'),
  jobID: z.string().describe('Job identifier of the latest report about the page (example: x9z)'),
  reason: z.string().describe('20- to 100-character reason why the page should be retested')
};

// requestFeature: POST /api/requestFeature
exports.requestFeatureSchema = {
  request: z.string().describe('description of requested new feature or feature improvement')
};

// listReports takes no input; omitted (mcp.js already uses inputSchema: {}).

// RESPONSE SCHEMAS

// Facts about a rule engine, as constructed by Kilotest's own getRuleEngineFacts (never copied from a Testaro report).
const ruleEngineFactsSchema = z.object({
  identifier: z.string(),
  name: z.string().nullable(),
  sponsor: z.string().nullable()
});

// Facts about the Kilotest tool collection, included in every response.
const toolsFactsSchema = z.object({
  name: z.string(),
  description: z.object({
    'what Kilotest does': z.string(),
    'how to retrieve findings': z.object({
      'level 1': z.string(),
      'level 2': z.string(),
      'level 3': z.string(),
      'level 4': z.string()
    }),
    'how to generate more findings': z.object({
      'new testing': z.string(),
      'retesting': z.string(),
      'latency': z.string(),
      'confirmation': z.string()
    })
  }).describe('Explanation of what Kilotest does and how to use its tools.'),
  URL: z.string().describe('URL of the Kilotest MCP server.'),
  'web users can obtain similar functionalities at': z.string()
});

// Identifies a related request (e.g. the closest ancestor request in the drill-down hierarchy).
const requestReferenceSchema = z.object({
  'tool name': z.string(),
  description: z.string(),
  method: z.enum(['GET', 'POST']),
  URL: z.string()
});

// GET endpoints have no 'body'; POST endpoints get a request-specific body schema.
const thisRequestSchema = bodySchema => z.object({
  description: z.string(),
  method: z.enum(['GET', 'POST']),
  URL: z.string(),
  ...(bodySchema ? {body: bodySchema} : {}),
  'closest ancestor request': requestReferenceSchema.nullable()
});

const envelope = (responseContentSchema, bodySchema) => z.object({
  'tool collection': toolsFactsSchema,
  'tool name': z.string(),
  'this request': thisRequestSchema(bodySchema),
  'URLs of similar requests for web users': similarWebRequestsSchema,
  'response metadata': responseMetadataSchema,
  'response content': responseContentSchema
});

const similarWebRequestsSchema = z.object({
  'this request': z.string().describe('URL of the equivalent web UI page for this request.'),
  'closest ancestor request': z.string().nullable()
});

const responseMetadataSchema = z.object({
  identifier: z.string().describe('Unique identifier of this response (timestamp and random suffix).'),
  'date and time': z.string().describe('UTC date and time when the response was generated, in ISO 8601 format.')
});

// Facts about a report, as constructed by Kilotest's own getReportBasics (never copied from a Testaro report).
const reportBasicsSchema = z.object({
  identifier: z.string().describe('timeStamp-jobID identifier of the report.'),
  'completion date and time': z.string(),
  'days since the report was completed': z.number(),
  'tested web page': z.object({description: z.string(), URL: z.string()}),
  'whether a later report about the same page exists': z.boolean()
});

const reportBasicsOrErrorSchema = z.union([
  reportBasicsSchema,
  z.object({error: z.string()})
]);

// Facts about an issue, as constructed by Kilotest's own issue classification (never copied from a Testaro report).
const issueBasicsSchema = z.object({
  identifier: z.string(),
  summary: z.string(),
  'impact on a user': z.string(),
  priority: z.enum(['lowest', 'low', 'high', 'highest'])
});

const issueBasicsOrErrorSchema = z.union([
  issueBasicsSchema.extend({
    'related WCAG standard': z.object({
      layer: z.enum(['success criterion', 'guideline']),
      identifier: z.string()
    })
  }),
  z.object({error: z.string()})
]);

exports.listReportsResponseSchema = envelope(z.object({
  'basics about all available reports': z.array(reportBasicsSchema.extend({
    'how to get details about the report': z.object({method: z.literal('GET'), URL: z.string()}),
    'web users can get details about the report at': z.string()
  })),
  'how to request that a page with no report be tested': z.object({
    method: z.literal('POST'),
    URL: z.string(),
    'request body': z.object({description: z.string(), URL: z.string(), reason: z.string()}),
    'how to check whether the request has been fulfilled': z.string()
  }),
  'how a web user can request that the page be tested': z.object({URL: z.string()})
}));

exports.listIssuesResponseSchema = envelope(z.object({
  'basics about the report': reportBasicsOrErrorSchema,
  'details about the report': z.object({
    'job definition': z.object({
      'whether the job prohibited redirection': z.unknown().describe('Copied from the report (strict); type not guaranteed.'),
      'whether the native results of rule engines are reported': z.boolean(),
      'whether standardized results are reported': z.boolean(),
      'device emulated by the job': z.unknown().describe('Device object copied verbatim from the report; shape may vary.'),
      'browser type used by the job': z.unknown().describe('Copied from the report (browserID); type not guaranteed.')
    }),
    'test results': z.object({
      'rule engines that tried to test the page': z.array(ruleEngineFactsSchema),
      'rule engines that could not test the page': z.array(z.object({
        name: z.string().nullable(),
        'reason for failure': z.unknown().describe('Copied verbatim from the Testaro report; shape may vary.')
      })),
      'names of rule engines that reported rule violations': z.array(z.string().nullable()),
      'counts of issues by priority': z.object({
        highest: z.number(), high: z.number(), low: z.number(), lowest: z.number()
      }),
      'number of elements reported as violators': z.number()
    })
  }).nullable(),
  'how to request that the page be retested': z.union([
    z.object({notice: z.string()}),
    z.object({
      method: z.literal('POST'),
      URL: z.string(),
      'request body': z.object({reason: z.string()}),
      'how to check whether the request has been fulfilled': z.string()
    })
  ]).nullable(),
  'how a web user can request that the page be retested': z.object({URL: z.string()}).nullable(),
  'how to get the full report in JSON': z.object({
    'size of the report in bytes': z.number(),
    method: z.literal('GET'),
    URL: z.string()
  }).nullable(),
  'how a web user can get the full report in JSON': z.object({URL: z.string()}).nullable(),
  'basics about all issues reported in the report': z.array(issueBasicsSchema.extend({
    'rule engines with any violations belonging to the issue': z.array(z.string()),
    'how to get details about the issue': z.object({method: z.literal('GET'), URL: z.string()}),
    'web users can get details about the issue at': z.string()
  }))
}));

exports.listViolatorsResponseSchema = envelope(z.object({
  'basics about the report': reportBasicsOrErrorSchema,
  'basics about the issue': issueBasicsOrErrorSchema,
  'details about the issue': z.object({
    'rule engines reporting violations belonging to the issue': z.array(ruleEngineFactsSchema)
  }).nullable(),
  'basics about all elements reported as exhibiting the issue': z.array(z.object({
    identifier: z.string(),
    'tag name': z.unknown().describe('Copied from the report catalog entry; type not guaranteed.'),
    'inner text': z.unknown().describe('Copied from the report catalog entry; type not guaranteed.'),
    'count of rule engines reporting that the element exhibited the issue': z.number(),
    'how to get details about the element': z.object({URL: z.string(), 'request method': z.literal('GET')}),
    'web users can get details about the element at': z.string()
  })).nullable()
}));

exports.listDiagnosesResponseSchema = envelope(z.object({
  'basics about the report': reportBasicsOrErrorSchema,
  'basics about the issue': issueBasicsOrErrorSchema,
  'basics about the element': z.object({
    identifier: z.string(),
    'tag name': z.unknown().describe('Copied from the report catalog entry; type not guaranteed.'),
    'inner text': z.unknown().describe('Copied from the report catalog entry; type not guaranteed.')
  }).or(z.object({error: z.string()})).nullable(),
  'details about the element': z.object({
    'start tag': z.unknown().describe('Copied from the report catalog entry; type not guaranteed.'),
    'XPath': z.unknown().describe('Copied from the report catalog entry; type not guaranteed.'),
    'x, y, width, and height of bounding box': z.unknown().describe('Copied from the report catalog entry; type not guaranteed.')
  }).nullable(),
  'diagnoses of how the element exhibited the issue': z.array(z.object({
    'identifier of the violated rule': z.unknown().describe('Copied from the report instance (ruleID); type not guaranteed.'),
    'description of the violation': z.unknown().describe('Copied from the report instance (what); type not guaranteed.'),
    'severity of the violation on a 0-to-3 scale': z.unknown().describe('Copied from the report instance (ordinalSeverity); type not guaranteed.'),
    'count of violations of the rule by the element': z.number()
  })).or(z.object({error: z.string()}))
}));

exports.getReportResponseSchema = envelope(z.object({
  'size of the report in bytes': z.union([z.number(), z.string()]),
  'full report': z.unknown().describe('The full raw Testaro/Testilo report JSON, copied verbatim, or an error object if it could not be retrieved.')
}));

exports.requestTestResponseSchema = envelope(
  z.object({'details about your request': z.union([
    z.object({error: z.string()}),
    z.object({
      'date and time received': z.string(),
      'page to be tested': z.object({description: z.string(), URL: z.string()}),
      'reason why the page should be tested': z.string()
    })
  ])}),
  z.object(exports.requestTestSchema)
);

exports.requestRetestResponseSchema = envelope(
  z.object({'details about your request': z.union([
    z.object({error: z.string()}),
    z.object({
      'date and time received': z.string(),
      'page to be retested': z.object({description: z.string(), URL: z.string()}),
      'reason why the page should be retested': z.string()
    })
  ])}),
  z.object({reason: exports.requestRetestSchema.reason})
);

exports.requestFeatureResponseSchema = envelope(
  z.object({'details about your request': z.union([
    z.object({error: z.string()}),
    z.object({
      'date and time received': z.string(),
      disposition: z.string()
    })
  ])}),
  z.object(exports.requestFeatureSchema)
);
