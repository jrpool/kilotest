/*
  violationData.ts
  Violation data, in the shape that getViolationData returns, for tests of its consumers. The rules are those of the mock classification in classification.ts. The data are crafted so that consumers' expected outputs can be hand-computed.

  Violation counts by issue, excluding cantTell instances and the ignorable issue:
  - mockIssueA (weight 4): 96 (axe mockRule) + 1 (alfa mockAlfaRule) = 97, by Alfa and Axe
  - mockIssueB (weight 1): 1 (axe mockOtherRule) + 1 (nuVal pattern) = 2, by Axe and Html Checker API
  - mockIssueC (weight 3): 1 (axe mockThirdRule), by Axe
  Total: 100, so the shares are 97%, 2%, and 1%.
*/

// IMPORTS

import type {OutcomeViolations, ViolationData} from '../../util.ts';

// FUNCTIONS

// Returns data on the instances of one outcome of a rule.
const outcome = (violators: string[], count: number, unlocatedCount = 0): OutcomeViolations => ({
  violators: new Set(violators), count, unlocatedCount
});
const none = (): OutcomeViolations => outcome([], 0);

// CONSTANTS

export const fixtureViolationData: ViolationData[] = [
  {
    extract: {
      id: '260101T0000-vd1',
      pageID: 'p-vdpageon',
      description: 'Violation Data Page One',
      url: 'https://example.com/vd1',
      reportTime: '2026-01-01T00:10:00.000Z',
      ruleEngineIDs: ['alfa', 'axe'],
      preventions: {},
      rulePreventions: {}
    },
    violations: {
      alfa: {
        mockAlfaRule: {failed: outcome(['0'], 1), cantTell: none()}
      },
      axe: {
        mockRule: {failed: outcome(['0', '1'], 96, 2), cantTell: outcome(['2'], 50)},
        mockOtherRule: {failed: outcome(['1'], 1), cantTell: none()},
        mockIgnorableRule: {failed: outcome(['3'], 1000), cantTell: none()}
      }
    }
  },
  {
    extract: {
      id: '260101T0000-vd2',
      pageID: 'p-vdpagetw',
      description: 'Violation Data Page Two',
      url: 'https://example.com/vd2',
      reportTime: '2026-01-01T00:10:00.000Z',
      ruleEngineIDs: ['axe', 'ibm', 'nuVal'],
      preventions: {ibm: 'page timed out'},
      rulePreventions: {}
    },
    violations: {
      axe: {
        mockRule: {failed: none(), cantTell: outcome(['0'], 2)},
        mockThirdRule: {failed: outcome(['4'], 1), cantTell: none()}
      },
      nuVal: {
        'Mock message about .+\\.': {failed: outcome(['5'], 1), cantTell: none()}
      }
    }
  }
];
