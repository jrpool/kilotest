/*
  schemas.ts
  Zod input and response schemas shared by mcp.ts (MCP tool inputSchema/outputSchema), api/routes.ts, and the openapi.yaml generation script (scripts/generate-openapi.ts). Descriptions and component ids (.meta({id})) in this file are the single source of truth for parameter documentation and OpenAPI component naming and reuse.
*/

// IMPORTS

import {z} from 'zod';

// TYPES

// A Zod schema of any shape, as accepted by the schema-composing helpers below.
type ZodTypeAny = import('zod').ZodTypeAny;

// REQUEST SCHEMAS

// Shape of a report identifier: the creating job's YYMMDDTHHMM time stamp and 3-character suffix joined with a hyphen. The pattern validates month, day-of-month (per month length), hour, and minute; the API layer's isReportID additionally rejects February 29 in non-leap years, which this pattern does not express.
const reportIDPattern = /^\d{2}(?:(?:0[13578]|1[02])(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)(?:0[1-9]|[12]\d|30)|02(?:0[1-9]|1\d|2[0-9]))T(?:[01]\d|2[0-3])[0-5]\d-[a-z0-9]{3}$/;

// Shape of a catalog index: a decimal position in the report's catalog of elements.
const catalogIndexPattern = /^\d+$/;

// Description of a reportID parameter identifying an existing report, reused across schemas below.
const reportIDDescription = 'Identifier of the report, formatted YYMMDDTHHMM-xxx (example: 260503T0432-x9z), as shown in the listPages output or a listIssues report history';

// Description of a reportID parameter identifying the retestable latest report of a page.
const latestReportIDDescription = 'Identifier of the latest report about the page, formatted YYMMDDTHHMM-xxx (example: 260503T0432-x9z); a superseded identifier is rejected';

// listIssues: GET /api/listIssues/{reportID}
export const listIssuesSchema = {
  reportID: z.string().regex(reportIDPattern).describe(reportIDDescription)
};

// listViolators: GET /api/listViolators/{issueID}/{reportID}
export const listViolatorsSchema = {
  issueID: z.string().describe('Issue identifier (example: contrastPoor), as listed in the listIssues output for the same report'),
  reportID: z.string().regex(reportIDPattern).describe(reportIDDescription)
};

// listDiagnoses: GET /api/listDiagnoses/{issueID}/{reportID}/{catalogIndex}
export const listDiagnosesSchema = {
  issueID: z.string().describe('Issue identifier (example: contrastPoor), as listed in the listIssues output for the same report'),
  reportID: z.string().regex(reportIDPattern).describe(reportIDDescription),
  catalogIndex: z.string().regex(catalogIndexPattern).describe('Identifier of the issue-exhibiting element in the catalog of elements on the page (example: 372), as shown in the listViolators output')
};

// getReport: GET /api/getReport/{reportID}
export const getReportSchema = {
  reportID: z.string().regex(reportIDPattern).describe(reportIDDescription)
};

// Which review path a test or retest request takes: true for immediate review with immediate approval or rejection and immediate enqueueing if approved, false or omitted to queue the request for review by management. Optional, defaulting to management review.
const reviewImmediatelyField = {
  reviewImmediately: z.boolean().optional().describe('true for immediate review with immediate approval or rejection and immediate enqueueing if approved; false or omitted to queue the request for review by management')
};

// Shape of a site identifier.
const siteIDPattern = /^s-[0-9a-z]{6}$/;
// Site identifier of an existing site, reused across schemas below.
const siteIDField = z.string().regex(siteIDPattern).describe('Identifier of the site, formatted s-xxxxxx (example: s-2fw2ea), as shown in the listSites output');
// Fields describing a page to be added, reused by requestNewTest and requestPageTest.
const newPageFields = {
  pageName: z.string().min(1).max(120).describe('1- to 120-character name of the page, distinguishing it from every other page of the site (for the home page of a site, “home”)'),
  URL: z.string().min(12).max(300).regex(/^https:\/\//).describe('12- to 300-character URL of the page, including the https:// scheme and any query; it must not redirect to a target this deployment disallows, such as a private, loopback, or link-local address'),
  reason: z.string().min(20).max(100).describe('20- to 100-character justification evaluated by the reviewer selected by reviewImmediately'),
  ...reviewImmediatelyField
};

// listPages: GET /api/listPages/{siteID}
export const listPagesSchema = {
  siteID: siteIDField
};

// requestNewTest: POST /api/requestNewTest
export const requestNewTestSchema = {
  siteName: z.string().min(1).max(80).describe('1- to 80-character name of the site, usually the name of the organization or brand that presents it; it must not match the name of any site in the listSites output, ignoring case, white space, and punctuation'),
  ...newPageFields
};

// requestPageTest: POST /api/requestPageTest/{siteID}
export const requestPageTestSchema = {
  siteID: siteIDField,
  ...newPageFields
};

// requestRetest: POST /api/requestRetest/{reportID}
export const requestRetestSchema = {
  reportID: z.string().regex(reportIDPattern).describe(latestReportIDDescription),
  reason: z.string().min(20).max(100).describe('20- to 100-character justification evaluated by the reviewer selected by reviewImmediately'),
  ...reviewImmediatelyField
};

// requestFeature: POST /api/requestFeature
export const requestFeatureSchema = {
  feature: z.string().min(20).max(1000).describe('20- to 1000-character proposal for a new feature or a feature improvement, evaluated by the reviewing manager')
};

// awaitTest: POST /api/awaitTest/{reportID}
export const awaitTestSchema = {
  reportID: z.string().regex(reportIDPattern).describe('Report identifier returned by an immediately reviewed test or retest submission for a job pending or in progress (example: 260503T0432-x9z); on completion it remains usable with listIssues and getReport')
};

// questionDiagnosis: POST /api/questionDiagnosis/{issueID}/{reportID}/{catalogIndex}
export const questionDiagnosisSchema = {
  issueID: z.string().describe('Issue identifier (example: contrastPoor), as in the listDiagnoses output that showed the disputed diagnosis'),
  reportID: z.string().regex(reportIDPattern).describe('Identifier of the report (example: 260503T0432-x9z), as in the listDiagnoses output that showed the disputed diagnosis'),
  catalogIndex: z.string().regex(catalogIndexPattern).describe('Identifier of the issue-exhibiting element in the catalog of elements on the page (example: 372), as in the listDiagnoses output that showed the disputed diagnosis'),
  engineID: z.string().describe('Identifier of the rule engine that produced the disputed diagnosis (example: axe), as shown in the listDiagnoses output'),
  ruleID: z.string().describe('Identifier of the rule whose diagnosis is disputed, as shown in the listDiagnoses output (example: color-contrast); if that output shows null for the rule identifier, use its description of the violation instead'),
  reason: z.string().min(20).max(1000).describe('20- to 1000-character explanation of why the diagnosis is disputed, evaluated by the reviewing manager')
};

// listSites takes no input; omitted (mcp.ts uses inputSchema: {}).

// RESPONSE SCHEMAS

// Facts about a rule engine, as constructed by Kilotest's own getRuleEngineFacts (never copied from a Testaro report).
const ruleEngineFactsSchema = z.object({
  identifier: z.string(),
  name: z.string().nullable(),
  sponsor: z.string().nullable()
}).meta({id: 'RuleEngineFacts'});

// Facts about the Kilotest tool collection, included in every response.
export const toolsFactsSchema = z.object({
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
      'approval': z.string(),
      'latency': z.string(),
      'request confirmation': z.string(),
      'order confirmation': z.string()
    })
  }).describe('Explanation of what Kilotest does and how to use its tools.'),
  URL: z.string().describe('URL of the Kilotest MCP server.'),
  'web users can obtain similar functionalities at': z.string()
}).meta({id: 'ToolsFacts'});

// Identifies a related request (e.g., the closest ancestor request in the drill-down
// hierarchy). method is usually GET (every drill-down tool's ancestor is a read), except
// for requestNewTest/requestRetest, whose own ancestor is a GET, and awaitTest, whose ancestors
// (requestNewTest and requestRetest) are both POST (they create a job).
const requestReferenceSchema = z.object({
  'tool name': z.string(),
  description: z.string(),
  method: z.enum(['GET', 'POST']),
  URL: z.string()
}).meta({id: 'RequestReference'});

// GET endpoints have no 'body'; POST endpoints get a request-specific body schema.
// ancestorSchema overrides the default single-ancestor shape for a tool whose closest
// ancestor is not unique: awaitTest can be reached from either requestNewTest or requestRetest,
// and the identifier alone does not say which, so it reports both as an array rather
// than arbitrarily picking one.
const thisRequestSchema = (method: string, bodySchema?: ZodTypeAny, ancestorSchema: ZodTypeAny = requestReferenceSchema.nullable()) => z.object({
  description: z.string(),
  method: z.literal(method),
  URL: z.string(),
  ...(bodySchema ? {body: bodySchema} : {}),
  'closest ancestor request': ancestorSchema
});

const envelope = <T extends ZodTypeAny>(
  method: string,
  responseContentSchema: T,
  bodySchema?: ZodTypeAny,
  similarWebSchema: ZodTypeAny = similarWebRequestsSchema,
  ancestorSchema?: ZodTypeAny
) => z.object({
  'tool collection': toolsFactsSchema,
  'tool name': z.string(),
  'this request': thisRequestSchema(method, bodySchema, ancestorSchema),
  'URLs of similar requests for web users': similarWebSchema,
  'response metadata': responseMetadataSchema,
  'response content': responseContentSchema
});

const similarWebRequestsSchema = z.object({
  'this request': z.string().describe('URL of the equivalent web UI page for this request.'),
  'closest ancestor request': z.string().nullable()
}).meta({id: 'SimilarWebRequests'});

const responseMetadataSchema = z.object({
  identifier: z.string().describe('Unique identifier of this response (timestamp and random suffix).'),
  'date and time': z.string().describe('UTC date and time when the response was generated, in ISO 8601 format.')
}).meta({id: 'ResponseMetadata'});

// The sites that a page belongs to.
const pageSitesSchema = z.array(z.object({
  identifier: z.string().describe('Identifier of the site (example: s-2fw2ea).'),
  name: z.string().describe('Current name of the site.')
}).meta({id: 'PageSite'})).describe('The sites that the page belongs to (currently always one).');

// Facts about a report, as constructed by Kilotest's own getReportBasics (never copied from a Testaro report).
const reportBasicsSchema = z.object({
  identifier: z.string().describe('Identifier of the report (example: 260503T0432-x9z).'),
  'completion date and time': z.string(),
  'days since the report was completed': z.number().nullable(),
  'tested web page': z.object({
    identifier: z.string().describe('Identifier of the page (example: p-l6vni7ua).'),
    name: z.string().describe('Current name of the page, distinguishing it from the other pages of its site.'),
    sites: pageSitesSchema,
    URL: z.string().describe('URL of the page as tested for this report.')
  }).meta({id: 'TestedPage'}),
  'whether a later report about the same page exists': z.boolean()
}).meta({id: 'ReportBasics'});

const reportBasicsOrErrorSchema = z.union([
  reportBasicsSchema,
  z.object({error: z.string()})
]).meta({id: 'ReportBasicsOrError'});

// Facts about an issue based on the Testilo issue classification.
const issueBasicsSchema = z.object({
  identifier: z.string(),
  summary: z.string(),
  'impact on a user': z.string(),
  priority: z.enum(['lowest', 'low', 'high', 'highest'])
}).meta({id: 'IssueBasics'});

const issueBasicsOrErrorSchema = z.union([
  issueBasicsSchema.extend({
    'related WCAG standard': z.object({
      layer: z.enum(['success criterion', 'guideline']),
      identifier: z.string()
    })
  }),
  z.object({error: z.string()})
]).meta({id: 'IssueBasicsOrError'});

// Facts about a report among those about one page.
const reportTimeSchema = z.object({
  identifier: z.string().describe('Identifier of the report (example: 260503T0432-x9z).'),
  'completion date and time': z.string(),
  'days since the report was completed': z.number().nullable()
});

// Facts about a site.
const siteFactsSchema = z.object({
  identifier: z.string().describe('Identifier of the site (example: s-2fw2ea).'),
  name: z.string(),
  'count of tested pages': z.number()
}).meta({id: 'SiteFacts'});

// Facts about a page.
const pageFactsSchema = z.object({
  identifier: z.string().describe('Identifier of the page (example: p-l6vni7ua).'),
  name: z.string().describe('Name of the page, distinguishing it from the other pages of its site.'),
  URL: z.string(),
  sites: pageSitesSchema,
  'identifier of the latest report': z.string().describe('Identifier of the latest report about the page (example: 260503T0432-x9z).')
}).meta({id: 'PageFacts'});

// How to request a test of a new page, as described in a listing.
const newPageRequestSchema = (bodySchema: ZodTypeAny) => z.object({
  method: z.literal('POST'),
  URL: z.string(),
  'request body': bodySchema,
  'how to check whether the request has been fulfilled': z.string()
});

export const listSitesResponseSchema = envelope('GET', z.object({
  'how to list the tested pages of a site': z.object({
    method: z.literal('GET'),
    URL: z.string().describe('URL template; replace {identifier} with the identifier of the site.')
  }),
  'web users can list the tested pages of a site at': z.string().describe('URL template; replace {identifier} with the identifier of the site.'),
  'basics about all tested sites': z.array(siteFactsSchema),
  'how to request a test of a page of a site not in this list': newPageRequestSchema(z.object({
    siteName: z.string(), pageName: z.string(), URL: z.string(), reason: z.string(), reviewImmediately: z.string()
  })),
  'how a web user can request a test of a page of a site not in this list': z.object({URL: z.string()})
}));

export const listPagesResponseSchema = envelope('GET', z.object({
  'basics about the site': z.union([
    z.object({identifier: z.string(), name: z.string()}),
    z.object({error: z.string()})
  ]),
  'how to get test results about a page': z.object({
    method: z.literal('GET'),
    URL: z.string().describe('URL template; replace {identifier} with the identifier of the latest report about the page.')
  }),
  'web users can get test results about a page at': z.string().describe('URL template; replace {identifier} with the identifier of the latest report about the page.'),
  'basics about all tested pages of the site': z.array(pageFactsSchema).nullable().describe('The tested pages of the site, ordered by name, or null if the site does not exist.'),
  'how to request a test of a page of this site not in this list': newPageRequestSchema(z.object({
    pageName: z.string(), URL: z.string(), reason: z.string(), reviewImmediately: z.string()
  })).nullable(),
  'how a web user can request a test of a page of this site not in this list': z.object({URL: z.string()}).nullable()
}));

export const listIssuesResponseSchema = envelope('GET', z.object({
  'basics about the report': reportBasicsOrErrorSchema,
  'history of reports about the page': z.array(reportTimeSchema.extend({
    'whether it is the oldest report about the page': z.boolean(),
    'whether it is the latest report about the page': z.boolean(),
    'whether it is the report described in this response': z.boolean(),
    'how to get details about the report': z.object({method: z.literal('GET'), URL: z.string()}),
    'web users can get details about the report at': z.string()
  })).nullable().describe('All reports about the same page, from oldest to latest, or null if the report is unavailable.'),
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
    'rule engines with any violations belonging to the issue': z.array(z.string().nullable()),
    'how to get details about the issue': z.object({method: z.literal('GET'), URL: z.string()}),
    'web users can get details about the issue at': z.string()
  })).nullable()
}));

export const listViolatorsResponseSchema = envelope('GET', z.object({
  'basics about the report': reportBasicsOrErrorSchema,
  'basics about the issue': issueBasicsOrErrorSchema,
  'details about the issue': z.object({
    'rule engines reporting violations belonging to the issue': z.array(ruleEngineFactsSchema)
  }).nullable(),
  'basics about all elements exhibiting the issue': z.array(z.object({
    identifier: z.union([z.string(), z.number()]).describe('Catalog index of the element in the report; a string or number, copied verbatim.'),
    'tag name': z.unknown().describe('Copied from the report catalog entry; type not guaranteed.'),
    'inner text': z.unknown().describe('Copied from the report catalog entry; type not guaranteed.'),
    'count of rule engines reporting that the element exhibited the issue': z.number(),
    'how to get details about the element': z.object({method: z.literal('GET'), URL: z.string()}),
    'web users can get details about the element at': z.string()
  })).nullable()
}));

export const listDiagnosesResponseSchema = envelope('GET', z.object({
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
    'identifier of the rule engine': z.unknown().describe('Copied from the report act (which); type not guaranteed.'),
    'identifier of the violated rule': z.unknown().describe('Copied from the report instance (ruleID); type not guaranteed.'),
    'description of the violation': z.unknown().describe('Copied from the report instance (what); type not guaranteed.'),
    'severity of the violation on a 0-to-3 scale': z.unknown().describe('Copied from the report instance (ordinalSeverity); type not guaranteed.'),
    'count of violations of the rule by the element': z.number(),
    'how to question this diagnosis': z.object({
      method: z.literal('POST'),
      URL: z.string(),
      'request body': z.object({
        engineID: z.string(),
        ruleID: z.string(),
        reason: z.string()
      })
    })
  })).or(z.object({error: z.string()})).nullable()
}));

export const getReportResponseSchema = envelope('GET', z.object({
  'size of the report in bytes': z.union([z.number(), z.string()]),
  'full report': z.unknown().describe('The full raw Testaro/Testilo report JSON, copied verbatim, or an error object if it could not be retrieved.')
}));

// Identifies the report a successfully ordered or awaited job will produce, once complete.
const reportIdentifierSchema = z.string().describe('Identifier of the report, to pass to listIssues once the report is ready (example: 260503T0432-x9z).');

// A page that a request concerns.
const requestedPageSchema = z.object({
  'site identifier': z.string().nullable().describe('Identifier of the site, or null if the site does not exist yet.'),
  'site name': z.string(),
  'page identifier': z.string().nullable().describe('Identifier of the page, or null if the page does not exist yet.'),
  'page name': z.string(),
  URL: z.string()
}).meta({id: 'RequestedPage'});

// Details about a request for a test of a new page.
const newTestDetailsSchema = z.union([
  z.object({error: z.string()}),
  z.object({
    'date and time received': z.string(),
    'page to be tested': requestedPageSchema,
    'reason why the page should be tested': z.string()
  })
]);

// Same, for a retest.
const retestDetailsSchema = z.union([
  z.object({error: z.string()}),
  z.object({
    'date and time received': z.string(),
    'page to be retested': requestedPageSchema,
    'reason why the page should be retested': z.string()
  })
]);

// Disposition of a consolidated request: a superset of the management-review fields ('how a web user can check for completion') and the immediate-review fields ('report identifier', 'do you want to wait for completion'). Null when the submission itself was invalid.
const submissionDispositionSchema = z.object({
  'what happens next': z.string(),
  'report identifier': reportIdentifierSchema.nullable().optional(),
  'how you can check for completion': z.string(),
  'how a web user can check for completion': z.string().optional(),
  'do you want to wait for completion': z.string().optional(),
  'whether your request was referred to management review': z.boolean().optional().describe('true if immediate review was requested but the request was referred to management review because of possible duplicates or similar sites.'),
  'possible duplicates': z.array(pageFactsSchema.extend({'reason for suspicion': z.string()})).optional().describe('Tested pages that may be the requested page. If one is, its latest report can be used at once.'),
  'similar sites': z.array(siteFactsSchema.extend({'reason for suspicion': z.string()})).optional().describe('Existing sites that may be the requested site. If one is, a test of a page of it can be requested with requestPageTest.')
}).nullable();

export const requestNewTestResponseSchema = envelope(
  'POST',
  z.object({
    'details about your request': newTestDetailsSchema,
    'disposition of your request': submissionDispositionSchema
  }),
  z.object(requestNewTestSchema)
);

export const requestPageTestResponseSchema = envelope(
  'POST',
  z.object({
    'details about your request': newTestDetailsSchema,
    'disposition of your request': submissionDispositionSchema
  }),
  z.object({
    pageName: requestPageTestSchema.pageName,
    URL: requestPageTestSchema.URL,
    reason: requestPageTestSchema.reason,
    reviewImmediately: requestPageTestSchema.reviewImmediately
  })
);

export const requestRetestResponseSchema = envelope(
  'POST',
  z.object({
    'details about your request': retestDetailsSchema,
    'disposition of your request': submissionDispositionSchema
  }),
  z.object({reason: requestRetestSchema.reason, reviewImmediately: requestRetestSchema.reviewImmediately})
);

export const requestFeatureResponseSchema = envelope(
  'POST',
  z.object({'details about your request': z.union([
    z.object({error: z.string()}),
    z.object({
      'date and time received': z.string(),
      disposition: z.string()
    })
  ])}),
  z.object(requestFeatureSchema),
  z.null()
);

export const questionDiagnosisResponseSchema = envelope(
  'POST',
  z.object({'details about your request': z.union([
    z.object({error: z.string()}),
    z.object({
      'date and time received': z.string(),
      'diagnosis you question': z.object({
        'issue identifier': z.string(),
        'identifier of the rule engine': z.string(),
        'identifier of the violated rule': z.string()
      }),
      disposition: z.string()
    })
  ])}),
  z.object({
    engineID: questionDiagnosisSchema.engineID,
    ruleID: questionDiagnosisSchema.ruleID,
    reason: questionDiagnosisSchema.reason
  }),
  z.null()
);

export const awaitTestResponseSchema = envelope(
  'POST',
  z.object({
    'details about your wait': z.union([
      z.object({error: z.string()}),
      z.object({
        'report identifier': reportIdentifierSchema
      })
    ]),
    'disposition of your wait': z.object({
      outcome: z.enum(['completed', 'failed', 'timedOut']),
      'what happened': z.string(),
      'how you can check for completion': z.string()
    }).nullable()
  }),
  undefined,
  z.object({
    'this request': z.null(),
    'closest ancestor request': z.null()
  }),
  // awaitTest can be reached from either requestNewTest or requestRetest, and its own
  // reportID parameter does not say which one produced it, so both possible
  // ancestors are reported, rather than arbitrarily naming just one as "the" ancestor.
  z.array(requestReferenceSchema).length(2)
);
