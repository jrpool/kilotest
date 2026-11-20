/*
  index.ts
  Lists the sets of rules that match, according to the latest available report about each page. Two rules match if, on every page on which both were tested, the same elements violated both of them, and they were violated on enough such pages. Which rules were tested on a page is determined as described in docs/decisions/012-rule-test-coverage.md. Because the pages on which rules were tested differ, matching is not transitive, so the listed sets are the maximal sets of rules every two of which match, and a rule can belong to more than one of them.
*/

// IMPORTS

import {
  getRuleKeySpec,
  getViolationData,
  htmlSafe,
  populateTemplate,
  reannotationNeededMessage,
  ruleEngines
} from '../../util.ts';
import type {OutcomeViolations, ReportExtract, ViolationData} from '../../util.ts';
import {getCountString} from '../util.ts';
import {issues as issueSpecs} from 'testaro-issues';

// TYPES

// A rule, identified by its rule engine and its rule key.
export type RuleRef = {engineID: string; ruleKey: string};
// A maximal set of rules every two of which match, with the least number of pages supporting the match of any two of them.
export type RuleMatch = {rules: RuleRef[]; supportPages: number};
// The kind of a set of matching rules, according to the rule engines of its rules.
type MatchKind = 'differentEngines' | 'mixedEngines' | 'sameEngine';

// CONSTANTS

// Default minimum number of pages on which two rules must both have been tested and violated by the same elements to match.
export const minSupportPages = 3;
// Lowest minimum number of supporting pages that a user can request, since a match supported by only 1 page is too likely to be a coincidence.
export const lowestMinSupport = 2;
// Headings of the lists of sets of matching rules, by kind, in display order.
const kindHeadings: Record<MatchKind, string> = {
  differentEngines: 'Rules of different rule engines',
  mixedEngines: 'Rules of the same and different rule engines',
  sameEngine: 'Rules of the same rule engine'
};

// FUNCTIONS

// Returns the identifier of a rule, unique across rule engines. Rule keys contain no line feeds.
const getRuleID = (engineID: string, ruleKey: string): string => `${engineID}\n${ruleKey}`;
// Returns the rule identified by a rule identifier.
const getRuleRef = (ruleID: string): RuleRef => {
  const [engineID, ruleKey] = ruleID.split('\n') as [string, string];
  return {engineID, ruleKey};
};
// Returns whether a rule was tested on the page of a report.
const isTested = (extract: ReportExtract, {engineID, ruleKey}: RuleRef): boolean => extract
.ruleEngineIDs
.includes(engineID)
&& !(engineID in extract.preventions)
&& !extract.rulePreventions[engineID]?.includes(ruleKey);
// Returns whether two sets have the same members.
const isSameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean => a.size === b.size
&& Array.from(a).every(member => b.has(member));
// Returns the members of a set that are also members of another set.
const intersect = (a: Set<string>, b: Set<string>): Set<string> => new Set(
  Array.from(a).filter(member => b.has(member))
);
// Returns the maximal sets of rules every two of which match, given violation data, sorted by decreasing size, then by decreasing support, then by their first rules.
export const getRuleMatches = (data: ViolationData[], minSupport: number = minSupportPages): RuleMatch[] => {
  // Initialize the violations of each rule, by rule identifier and page index.
  const ruleViolations = new Map<string, Map<number, OutcomeViolations>>();
  // Initialize the rules violated by each element, by page index and catalog index.
  const elementRules = new Map<string, string[]>();
  // For each violated rule on each page:
  data.forEach(({violations}, pageIndex) => {
    for (const [engineID, engineViolations] of Object.entries(violations)) {
      for (const [ruleKey, {failed}] of Object.entries(engineViolations)) {
        if (failed.count) {
          const ruleID = getRuleID(engineID, ruleKey);
          // Record its violations on the page.
          (ruleViolations.get(ruleID) ?? ruleViolations.set(ruleID, new Map()).get(ruleID)!).set(pageIndex, failed);
          // Record it as violated by each of its violators.
          for (const catalogIndex of failed.violators) {
            const elementID = `${pageIndex}#${catalogIndex}`;
            (elementRules.get(elementID) ?? elementRules.set(elementID, []).get(elementID)!).push(ruleID);
          }
        }
      }
    }
  });
  // Returns the number of pages supporting the match of two rules, or null if they do not match.
  const getPairSupport = (ruleIDA: string, ruleIDB: string): number | null => {
    const ruleA = getRuleRef(ruleIDA);
    const ruleB = getRuleRef(ruleIDB);
    const violationsA = ruleViolations.get(ruleIDA)!;
    const violationsB = ruleViolations.get(ruleIDB)!;
    let support = 0;
    // For each page on which either rule was violated:
    for (const pageIndex of new Set([...violationsA.keys(), ...violationsB.keys()])) {
      const {extract} = data[pageIndex]!;
      // If both rules were tested on it:
      if (isTested(extract, ruleA) && isTested(extract, ruleB)) {
        const pageViolationsA = violationsA.get(pageIndex);
        const pageViolationsB = violationsB.get(pageIndex);
        // If only one of them was violated, they do not match.
        if (!pageViolationsA || !pageViolationsB) {
          return null;
        }
        // Otherwise, if any of their violators is unknown, the page provides no evidence.
        if (pageViolationsA.unlocatedCount || pageViolationsB.unlocatedCount) {
          continue;
        }
        // Otherwise, if their violators differ, they do not match.
        if (!isSameSet(pageViolationsA.violators, pageViolationsB.violators)) {
          return null;
        }
        // Otherwise, the page supports their match.
        support++;
      }
    }
    return support;
  };
  // Initialize the matching rules of each rule and the supports of the matches, by pair key.
  const adjacency = new Map<string, Set<string>>();
  const pairSupports = new Map<string, number>();
  // For each pair of rules violated by a common element, i.e. each pair that can match:
  for (const ruleIDs of elementRules.values()) {
    ruleIDs.forEach((ruleIDA, index) => {
      for (const ruleIDB of ruleIDs.slice(index + 1)) {
        const pairKey = [ruleIDA, ruleIDB].sort().join('\n\n');
        // If it has not been evaluated yet:
        if (!pairSupports.has(pairKey)) {
          const support = getPairSupport(ruleIDA, ruleIDB);
          // Record its support, or a nonqualifying support if it does not match.
          pairSupports.set(pairKey, support ?? -1);
          // If its rules match:
          if (support !== null && support >= minSupport) {
            // Record them as matching each other.
            (adjacency.get(ruleIDA) ?? adjacency.set(ruleIDA, new Set()).get(ruleIDA)!).add(ruleIDB);
            (adjacency.get(ruleIDB) ?? adjacency.set(ruleIDB, new Set()).get(ruleIDB)!).add(ruleIDA);
          }
        }
      }
    });
  }
  // Find the maximal sets of matching rules with the Bron–Kerbosch algorithm with pivoting. Every rule in the adjacency has a match, so every maximal set has at least 2 rules.
  const ruleSets: string[][] = [];
  const expand = (members: string[], candidates: Set<string>, excluded: Set<string>) => {
    // If the set cannot be extended:
    if (!candidates.size && !excluded.size) {
      // Record it.
      ruleSets.push(members);
      return;
    }
    // Otherwise, choose as the pivot the rule with the most matches.
    const pivot = [...candidates, ...excluded].reduce(
      (best, ruleID) => adjacency.get(ruleID)!.size > adjacency.get(best)!.size ? ruleID : best
    );
    // For each candidate not matching the pivot:
    for (const ruleID of [...candidates].filter(ruleID => !adjacency.get(pivot)!.has(ruleID))) {
      const matches = adjacency.get(ruleID)!;
      // Extend the set with it.
      expand([...members, ruleID], intersect(candidates, matches), intersect(excluded, matches));
      candidates.delete(ruleID);
      excluded.add(ruleID);
    }
  };
  // If any rules match:
  if (adjacency.size) {
    // Find the sets.
    expand([], new Set(adjacency.keys()), new Set());
  }
  // Return the sets with their supports, sorted.
  return ruleSets
  .map(ruleIDs => {
    const sortedRuleIDs = ruleIDs.sort();
    const supports = sortedRuleIDs.flatMap((ruleIDA, index) => sortedRuleIDs
    .slice(index + 1)
    .map(ruleIDB => pairSupports.get(`${ruleIDA}\n\n${ruleIDB}`)!));
    return {rules: sortedRuleIDs.map(getRuleRef), supportPages: Math.min(...supports), firstRuleID: sortedRuleIDs[0]!};
  })
  .sort((a, b) => b.rules.length - a.rules.length
    || b.supportPages - a.supportPages
    || a.firstRuleID.localeCompare(b.firstRuleID))
  .map(({rules, supportPages}) => ({rules, supportPages}));
};
// Returns the kind of a set of matching rules.
const getMatchKind = ({rules}: RuleMatch): MatchKind => {
  const engineCount = new Set(rules.map(({engineID}) => engineID)).size;
  return engineCount === 1 ? 'sameEngine' : engineCount === rules.length ? 'differentEngines' : 'mixedEngines';
};
// Returns a description of a rule as an HTML list item.
const getRuleItem = ({engineID, ruleKey}: RuleRef, margin: string): string => {
  const {what, issueID} = getRuleKeySpec(engineID, ruleKey)!;
  const engineName = htmlSafe(ruleEngines[engineID]![0]);
  const issueLink = `<a href="/listRules.html/${issueID}">${htmlSafe(issueSpecs[issueID]!.summary)}</a>`;
  return `${margin}<li>${engineName} rule <code>${htmlSafe(ruleKey)}</code>: ${htmlSafe(what)} (issue: ${issueLink})</li>`;
};
// Returns the canonical path tail of a request for the page, given its path tail and query string. The form submits the minimum support as the minPages query parameter, but the minimum belongs in the path, and the default minimum in neither.
export const getCanonicalTail = (pathTail: string, search: string): string => {
  const tail = new URLSearchParams(search).get('minPages') ?? pathTail;
  return tail === String(minSupportPages) ? '' : tail;
};
// Returns the minimum support requested in the path tail of a request, or the default and an error message if the requested value is invalid.
const getMinSupport = (requested: string): {minSupport: number; minSupportError?: string} => {
  // If no value was requested:
  if (!requested) {
    // Return the default.
    return {minSupport: minSupportPages};
  }
  // Otherwise, if a valid value was requested:
  if (/^\d{1,2}$/.test(requested) && Number(requested) >= lowestMinSupport) {
    // Return it.
    return {minSupport: Number(requested)};
  }
  // Otherwise, return the default and an error message.
  return {
    minSupport: minSupportPages,
    minSupportError: `The minimum number of supporting pages must be a whole number from ${lowestMinSupport} to 99, so the default, ${minSupportPages}, was used.`
  };
};
// Returns a page listing the sets of matching rules, with the minimum support specified by the path tail, if any.
export const answer = async (pathTail: string = '') => {
  const violationData = await getViolationData();
  // If the data are unavailable until reports are reannotated:
  if ('error' in violationData && violationData.error === reannotationNeededMessage) {
    // Return a page stating this, which correctly answers the question.
    return {
      status: 'ok',
      answerPage: await populateTemplate(
        import.meta.dirname, {intro: `${reannotationNeededMessage}.`, form: '', matches: ''}
      )
    };
  }
  // Otherwise, if the data could not be compiled:
  if ('error' in violationData) {
    // Return the reason.
    return {status: 'error', message: violationData.error};
  }
  const margin = ' '.repeat(6);
  const {minSupport, minSupportError} = getMinSupport(pathTail);
  const ruleMatches = getRuleMatches(violationData, minSupport);
  const lines: string[] = minSupportError ? [`${margin}<p class="error">${minSupportError}</p>`] : [];
  // For each kind of set of matching rules:
  for (const [kind, heading] of Object.entries(kindHeadings)) {
    const kindMatches = ruleMatches.filter(ruleMatch => getMatchKind(ruleMatch) === kind);
    lines.push(`${margin}<h2>${heading}</h2>`);
    // If there are any sets of the kind:
    if (kindMatches.length) {
      // Add a list of them.
      lines.push(`${margin}<ul class="ruleMatches">`);
      for (const ruleMatch of kindMatches) {
        lines.push(`${margin}  <li>`);
        lines.push(`${margin}    <ul>`);
        lines.push(...ruleMatch.rules.map(rule => getRuleItem(rule, `${margin}      `)));
        lines.push(`${margin}    </ul>`);
        lines.push(
          `${margin}    <p>Each two of these rules were violated by the same elements on at least ${ruleMatch.supportPages} pages on which both were tested.</p>`
        );
        lines.push(`${margin}  </li>`);
      }
      lines.push(`${margin}</ul>`);
    }
    // Otherwise, i.e. if there are none:
    else {
      // Say so.
      lines.push(`${margin}<p>No such sets.</p>`);
    }
  }
  const intro = [
    'Two rules are suspected duplicates if, on every page on which both were tested, the same elements violated both of them.',
    `To be listed, they must also have been violated on at least ${minSupport} such pages.`,
    'The sets shown below are the largest sets of rules in which every two rules match.',
    'A rule can belong to more than one set, because rules were not all tested on the same pages.',
    `Sets found: ${ruleMatches.length}, based on the last test of each of ${getCountString(violationData.length, 'page', 'pages')}.`
  ].join(' ');
  const form = [
    `${margin}<form method="get" action="/listRuleMatches.html">`,
    `${margin}  <p><label>You may change the minimum number of supporting pages (from ${lowestMinSupport} to 99): <input class="size2" type="number" name="minPages" min="${lowestMinSupport}" max="99" step="1" value="${minSupport}" required></label></p>`,
    `${margin}  <p><button type="submit">Recompute</button></p>`,
    `${margin}</form>`
  ].join('\n');
  return {
    status: 'ok',
    answerPage: await populateTemplate(import.meta.dirname, {intro, form, matches: lines.join('\n')})
  };
};
