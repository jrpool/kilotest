/*
  content.ts
  Canonical prose describing what Kilotest is and does, reused verbatim by mcp.ts, scripts/generate-openapi.ts, scripts/generate-lhm.ts, and scripts/generate-llms.ts, so the sentences are written once instead of being hand-copied into mcp.ts, lhm.plugin.json, llms.txt, and openapi.yaml.
*/

// CONSTANTS

// Brief description of the Kilotest tool collection. Used as the MCP server description and as lhm.plugin.json’s top-level description. No length limit.
export const collectionDescription = 'Tools that test web pages with an ensemble of 12 rule engines for front-end quality (accessibility, usability, and W3C web standards, including HTML, CSS, ARIA, and WCAG)';

// Description of the Kilotest domain and data hierarchy. Used as (1) the McpServer instructions, which is the only place most tools' own descriptions get this context from, since repeating it in each of their descriptions would dilute how models read each tool, (2) the first paragraph of the kilotestOverview prose that mcp.ts returns from the getOverview tool and the kilotest-overview resource, (3) the opening paragraph of llms.txt, (4) the start of the openapi.yaml info.description, and (5) the kilotest-overview resource's own description. The getOverview tool's own description carries only a one-line domain summary, because some MCP clients do not propagate the McpServer instructions to their models; the full context still appears in its returned body.
export const sharedContext = 'Kilotest integrates an ensemble of 12 rule engines, with about 1,300 rules, to test web pages for front-end quality (accessibility, usability, and W3C web standards, including HTML, CSS, ARIA, and WCAG). Each test job generates a standardized report describing which elements violated which rules and grouping the violations into about 380 issues. Kilotest can list the tested pages, the reports about each page, the issues in each report, the violators of each issue, and the diagnoses of each violation. Kilotest also accepts requests to test pages not yet tested and to retest already tested pages.';
