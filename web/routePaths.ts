/*
  routePaths.ts
  Paths that the web interface is authorized to handle, by method, as glob-style
  patterns where * matches any sequence of characters.
*/

export const webRoutePaths = {
  GET: [
    '*.html*',
    '/',
    '/index.html'
  ],
  POST: [
    '/ai0BalanceForm.html',
    '/deleteNotesForm.html',
    '/expungeReportsForm.html',
    '/hideReportForm.html',
    '/metrics.html',
    '/pruneReportsForm.html',
    '/reregisterForm.html',
    '/rewindReportsForm.html',
    '/showHiddenReportsForm.html',
    '/tutorialAIComment.html',
    '/reannotate.html',
    '/requestAction.html',
    '/renewWCAG.html',
    '/requestRetest.html/*',
    '/requestNewTest.html',
    '/tutorialWebComment.html',
    '/unhideReportForm.html'
  ]
};
