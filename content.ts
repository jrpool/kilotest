/*
  content.ts
  Canonical prose describing what Kilotest is and does, reused verbatim by mcp.ts, scripts/generate-openapi.ts, scripts/generate-lhm.ts, and scripts/generate-llms.ts.
*/

// CONSTANTS

// Brief description of the Kilotest tool collection. Used as the MCP server description and as lhm.plugin.json’s top-level description. No length limit.
export const collectionDescription = 'Tools that test web pages with an ensemble of 12 rule engines for front-end quality (accessibility, usability, and W3C web standards, including HTML, CSS, ARIA, and WCAG)';

// Description of the Kilotest domain and data hierarchy. Used in the generation of multiple documentation files. The getOverview tool description is brief, because some MCP clients do not propagate the McpServer instructions to their models; the full context still appears in its returned body.
export const sharedContext = 'Kilotest is a powerful web validator. It integrates an ensemble of 12 rule engines (Axe, HTML CodeSniffer, QualWeb, Nu Html Checker, etc.), with about 1,300 rules, to audit web pages for front-end quality (accessibility, usability, and W3C web standards, including HTML, CSS, ARIA, and WCAG). Each test job generates a standardized public report describing which elements violated which rules and grouping the violations into about 380 issues. Kilotest can list the tested sites and pages, the reports about each page, the issues in each report, the elements violating rules belonging to each issue, and the diagnoses of each violation. Kilotest also accepts requests to test pages not yet tested and to retest already tested pages. Kilotest features are available via a web UI, an API, and a hosted remote MCP server with streamable HTTP and no authentication.';
